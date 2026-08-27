/**
 * Block[] → .docx
 *
 * 两套排版规范共用这一个渲染器，靠 `DocTheme` 切换度量：
 *   - `uxkit`    移植自 `skills/ux-kit/scripts/convert_to_docx.py` 的 render_blocks
 *   - `analysis` 移植自 `skills/ux-analysis/scripts/analysis_builder.py` 的 build_report
 *
 * 两者共同的部分：全文微软雅黑（ASCII + eastAsia 都要设，否则 Word 里中文会回落到宋体）、
 * 标题深蓝 #1F4E79、引用灰 #595959、页边距 上下 2.54cm / 左右 3.17cm。
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  PageBreak,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
  convertMillimetersToTwip
} from 'docx';
import type { IRunOptions } from 'docx';

import { parseInline } from '../markdown/parseMarkdown';
import type { Block, DocTheme, InlineRun } from './blocks';

const CN_FONT = '微软雅黑';
const CODE_FONT = 'Consolas';
const DARK = '1F4E79'; // 深蓝：标题
const GRAY = '595959'; // 灰：注释 / 引用
const HEADER_FILL = 'DCE6F1'; // 表头底纹

/** 同时设 ascii / hAnsi / eastAsia，中英文才会都用微软雅黑。 */
const cnFont = { ascii: CN_FONT, hAnsi: CN_FONT, eastAsia: CN_FONT } as const;
const codeFont = { ascii: CODE_FONT, hAnsi: CODE_FONT, eastAsia: CN_FONT } as const;

/**
 * 两套排版度量。size 一律是半磅（docx 的 size 单位）。
 * analysis 主题的正文 11pt / 行距 1.15 / 段首空两格，来自 analysis_builder.py 的
 * BODY_SIZE / LINE_SPACING / _set_first_line_indent。
 */
interface ThemeSpec {
  bodyHalfPt: number;
  titleHalfPt: number;
  headingHalfPt: Record<1 | 2 | 3 | 4, number>;
  /** 行距（240 = 单倍行距） */
  lineSpacing?: number;
  /** 正文段首缩进字符数；analysis 主题为 2 */
  firstLineChars?: number;
}

const THEMES: Record<DocTheme, ThemeSpec> = {
  uxkit: {
    bodyHalfPt: 21,
    titleHalfPt: 36,
    headingHalfPt: { 1: 32, 2: 28, 3: 24, 4: 22 }
  },
  analysis: {
    bodyHalfPt: 22,
    titleHalfPt: 36,
    headingHalfPt: { 1: 32, 2: 28, 3: 24, 4: 22 },
    lineSpacing: 276, // 1.15 × 240
    firstLineChars: 2
  }
};

const HEADING_LEVELS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4
} as const;

interface RunStyle {
  sizeHalfPoints?: number;
  color?: string;
  bold?: boolean;
  italics?: boolean;
}

const toTextRun = (run: InlineRun, style: RunStyle = {}): TextRun => {
  const opts: IRunOptions = {
    text: run.text,
    font: run.code ? codeFont : cnFont,
    bold: style.bold || run.bold || undefined,
    italics: style.italics || run.italic || undefined,
    size: run.code ? 20 : style.sizeHalfPoints,
    color: style.color
  };
  return new TextRun(opts);
};

const inlineRuns = (text: string, style: RunStyle = {}): TextRun[] =>
  parseInline(text).map(r => toTextRun(r, style));

/**
 * 段首空两格。docx 没有 firstLineChars 的一等公民 API，
 * 用 firstLine（twip）等效表达：一个中文字宽 ≈ 字号磅值，2 字 = 2 × 磅值 × 20 twip。
 */
const firstLineIndent = (theme: ThemeSpec): { firstLine: number } | undefined =>
  theme.firstLineChars
    ? { firstLine: Math.round(theme.firstLineChars * (theme.bodyHalfPt / 2) * 20) }
    : undefined;

const bodySpacing = (theme: ThemeSpec) =>
  theme.lineSpacing ? { line: theme.lineSpacing, after: 60 } : { after: 60 };

const dataUrlToUint8 = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const imageParagraphs = (
  dataUrl: string,
  caption: string | undefined,
  widthInches: number,
  theme: ThemeSpec
): Paragraph[] => {
  const out: Paragraph[] = [];
  try {
    const bytes = dataUrlToUint8(dataUrl);
    const mime = /^data:image\/(png|jpe?g|gif)/i.exec(dataUrl)?.[1]?.toLowerCase();
    // docx v9 的 ImageRun.type 用 "jpg" 而不是 "jpeg"
    const type: 'png' | 'jpg' | 'gif' =
      mime === 'gif' ? 'gif' : mime === 'jpg' || mime === 'jpeg' ? 'jpg' : 'png';
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: bytes,
            type,
            transformation: {
              width: widthInches * 96,
              // 4:2 是 figsize 的默认比例，caption 与正文宽度对得上就够了
              height: Math.round(widthInches * 96 * 0.5)
            }
          })
        ]
      })
    );
  } catch {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: '（图略：图片数据无法解析）', font: cnFont, color: GRAY, size: 18 })]
      })
    );
  }
  if (caption) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: caption, font: cnFont, color: GRAY, size: 18 })]
      })
    );
  }
  return out;
};

const cell = (text: string, theme: ThemeSpec, opts: { bold?: boolean } = {}): TableCell =>
  new TableCell({
    children: [
      new Paragraph({
        children: inlineRuns(text, { sizeHalfPoints: theme.bodyHalfPt - 2, bold: opts.bold })
      })
    ],
    shading: opts.bold ? { type: ShadingType.CLEAR, fill: HEADER_FILL, color: 'auto' } : undefined
  });

const TABLE_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' } as const;

const renderTable = (block: Extract<Block, { type: 'table' }>, theme: ThemeSpec): Table => {
  const colCount = block.headers.length;
  const headerRow = new TableRow({
    tableHeader: true,
    children: block.headers.map(h => cell(h, theme, { bold: true }))
  });
  const bodyRows = block.rows.map(row => {
    // 行的单元格数可能与表头不一致，补齐/截断到表头列数，避免 Word 打不开
    const cells: TableCell[] = [];
    for (let i = 0; i < colCount; i += 1) cells.push(cell(row[i] ?? '', theme));
    return new TableRow({ children: cells });
  });
  return new Table({
    rows: [headerRow, ...bodyRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    borders: {
      top: TABLE_BORDER,
      bottom: TABLE_BORDER,
      left: TABLE_BORDER,
      right: TABLE_BORDER,
      insideHorizontal: TABLE_BORDER,
      insideVertical: TABLE_BORDER
    }
  });
};

/**
 * 核心结论三段式，对齐 analysis_builder.py 的 `_add_conclusion`：
 *   一句话结论加粗独立成段 → 关键数据逐条带项目符号且**无悬挂缩进** → 可信度与解读合并成一段（可信度在前）。
 */
const renderConclusion = (
  block: Extract<Block, { type: 'conclusion' }>,
  theme: ThemeSpec
): Paragraph[] => {
  const out: Paragraph[] = [];
  if (block.statement) {
    out.push(
      new Paragraph({
        spacing: { ...bodySpacing(theme), before: 120 },
        indent: firstLineIndent(theme),
        children: inlineRuns(block.statement, { sizeHalfPoints: theme.bodyHalfPt, bold: true })
      })
    );
  }
  for (const item of block.data) {
    out.push(
      new Paragraph({
        spacing: { ...bodySpacing(theme), after: 60 },
        // 手写项目符号 + 左缩进，不用 bullet：Python 版明确要求"无悬挂缩进"
        indent: { left: convertMillimetersToTwip(7.4) },
        children: [
          new TextRun({ text: '• ', font: cnFont, size: theme.bodyHalfPt }),
          ...inlineRuns(item, { sizeHalfPoints: theme.bodyHalfPt })
        ]
      })
    );
  }
  const tail = [block.confidence, block.interpretation].filter(Boolean).join('；');
  if (tail) {
    out.push(
      new Paragraph({
        spacing: bodySpacing(theme),
        indent: firstLineIndent(theme),
        children: inlineRuns(tail, { sizeHalfPoints: theme.bodyHalfPt })
      })
    );
  }
  return out;
};

/** Block[] → docx 的 section children。导出以便离线校验直接调用。 */
export const blocksToDocxChildren = (
  title: string | null,
  blocks: Block[],
  theme: ThemeSpec,
  subtitle?: string
): (Paragraph | Table)[] => {
  const children: (Paragraph | Table)[] = [];

  if (title) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: subtitle ? 80 : 240 },
        children: inlineRuns(title, {
          sizeHalfPoints: theme.titleHalfPt,
          bold: true,
          color: DARK
        })
      })
    );
  }
  if (subtitle) {
    // 技能硬约束：副标题只有「生成日期 + 方案类型」，居中灰色小字
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: subtitle, font: cnFont, color: GRAY, size: 18 })]
      })
    );
  }

  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        children.push(
          new Paragraph({
            heading: HEADING_LEVELS[block.level],
            children: inlineRuns(block.text, { bold: true, color: DARK })
          })
        );
        break;

      case 'paragraph':
        children.push(
          new Paragraph({
            spacing: bodySpacing(theme),
            indent: firstLineIndent(theme),
            children: inlineRuns(block.text, { sizeHalfPoints: theme.bodyHalfPt })
          })
        );
        break;

      case 'bullets':
        for (const item of block.items) {
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              spacing: bodySpacing(theme),
              children: inlineRuns(item, { sizeHalfPoints: theme.bodyHalfPt })
            })
          );
        }
        break;

      case 'numbered':
        // docx 的编号列表要挂 numbering 配置；这里把序号写进文本，
        // 视觉效果等同，且不必为一次性文档引入编号定义。
        block.items.forEach((item, idx) => {
          children.push(
            new Paragraph({
              indent: { left: convertMillimetersToTwip(7.5) },
              spacing: bodySpacing(theme),
              children: [
                new TextRun({ text: `${idx + 1}. `, font: cnFont, size: theme.bodyHalfPt }),
                ...inlineRuns(item, { sizeHalfPoints: theme.bodyHalfPt })
              ]
            })
          );
        });
        break;

      case 'quote':
        children.push(
          new Paragraph({
            indent: { left: convertMillimetersToTwip(10) },
            children: inlineRuns(block.text, { sizeHalfPoints: 18, color: GRAY })
          })
        );
        break;

      case 'codeblock':
        children.push(
          new Paragraph({
            children: [new TextRun({ text: block.text, font: codeFont, size: 20 })]
          })
        );
        break;

      case 'conclusion':
        children.push(...renderConclusion(block, theme));
        break;

      case 'table':
        if (!block.headers.length) break;
        if (block.title) {
          children.push(
            new Paragraph({
              spacing: { before: 120, after: 60 },
              children: inlineRuns(block.title, {
                sizeHalfPoints: theme.bodyHalfPt,
                bold: true
              })
            })
          );
        }
        children.push(renderTable(block, theme));
        // 表后补一个空段落，否则相邻两张表会粘在一起
        children.push(new Paragraph({ children: [] }));
        break;

      case 'chart':
        if (block.png) {
          children.push(...imageParagraphs(block.png, block.caption, 5.8, theme));
        } else {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `（图略：${block.error || '图表未渲染'}）`,
                  font: cnFont,
                  color: GRAY,
                  size: 18
                })
              ]
            })
          );
        }
        break;

      case 'image':
        children.push(
          ...imageParagraphs(block.dataUrl, block.caption, block.widthInches ?? 5.2, theme)
        );
        break;

      case 'pagebreak':
        children.push(new Paragraph({ children: [new PageBreak()] }));
        break;
    }
  }

  return children;
};

export interface DocxOptions {
  theme?: DocTheme;
  subtitle?: string;
}

export const blocksToDocument = (
  title: string | null,
  blocks: Block[],
  opts: DocxOptions = {}
): Document => {
  const theme = THEMES[opts.theme ?? 'uxkit'];
  return new Document({
    styles: {
      // 让内置样式也用微软雅黑，否则标题/列表会回落到 Calibri + 宋体
      default: {
        document: { run: { font: cnFont, size: theme.bodyHalfPt } },
        heading1: { run: { font: cnFont, color: DARK, bold: true, size: theme.headingHalfPt[1] } },
        heading2: { run: { font: cnFont, color: DARK, bold: true, size: theme.headingHalfPt[2] } },
        heading3: { run: { font: cnFont, color: DARK, bold: true, size: theme.headingHalfPt[3] } },
        heading4: { run: { font: cnFont, color: DARK, bold: true, size: theme.headingHalfPt[4] } }
      }
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(25.4),
              bottom: convertMillimetersToTwip(25.4),
              left: convertMillimetersToTwip(31.7),
              right: convertMillimetersToTwip(31.7)
            }
          }
        },
        children: blocksToDocxChildren(title, blocks, theme, opts.subtitle)
      }
    ]
  });
};

/** Block[] → .docx Blob（浏览器端）。 */
export const blocksToDocxBlob = (
  title: string | null,
  blocks: Block[],
  opts: DocxOptions = {}
): Promise<Blob> => Packer.toBlob(blocksToDocument(title, blocks, opts));

export { convertInchesToTwip };
