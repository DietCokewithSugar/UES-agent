/**
 * Block[] → .docx
 *
 * 移植自 `skills/ux-kit/scripts/convert_to_docx.py` 的 Step 2（`render_blocks`）。
 * 样式全部代码内控制，不依赖外部 reference 模板，与 Python 版保持一致：
 *   - 全文微软雅黑（ASCII + eastAsia 都要设，否则 Word 里中文会回落到宋体）
 *   - 标题深蓝 #1F4E79，引用/注释灰 #595959
 *   - 页边距 上下 2.54cm / 左右 3.17cm
 *
 * Python 版用 matplotlib 渲染 ```chart 代码块；浏览器端没有 matplotlib，
 * 走的是该脚本在缺少 matplotlib 时的同款降级路径——输出一行灰色提示。
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertMillimetersToTwip
} from 'docx';
import type { IRunOptions } from 'docx';

import { parseInline, type Block, type InlineRun } from '../markdown/parseMarkdown';

/** 与 Python 版的 CN_FONT / DARK / GRAY 一致。 */
const CN_FONT = '微软雅黑';
const CODE_FONT = 'Consolas';
const DARK = '1F4E79'; // 深蓝：标题
const GRAY = '595959'; // 灰：注释 / 引用
const HEADER_FILL = 'DCE6F1'; // 表头底纹（Python 版走 Word 内置 Light Grid Accent 1）

/** 同时设 ascii / hAnsi / eastAsia，中英文才会都用微软雅黑。 */
const cnFont = { ascii: CN_FONT, hAnsi: CN_FONT, eastAsia: CN_FONT } as const;
const codeFont = { ascii: CODE_FONT, hAnsi: CODE_FONT, eastAsia: CN_FONT } as const;

const HEADING_LEVELS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4
} as const;

interface RunStyle {
  /** 半角磅值 ×2 —— docx 的 size 单位是 half-point */
  sizeHalfPoints?: number;
  color?: string;
  bold?: boolean;
}

/** 一个 InlineRun → 一个 TextRun，叠加块级样式。对齐 Python 的 `_add_inline_runs` + `_set_font`。 */
const toTextRun = (run: InlineRun, style: RunStyle = {}): TextRun => {
  const opts: IRunOptions = {
    text: run.text,
    font: run.code ? codeFont : cnFont,
    bold: style.bold || run.bold || undefined,
    italics: run.italic || undefined,
    // 行内 code 固定 10pt（Python 版同此），其余跟随块级样式
    size: run.code ? 20 : style.sizeHalfPoints,
    color: style.color
  };
  return new TextRun(opts);
};

const inlineRuns = (text: string, style: RunStyle = {}): TextRun[] =>
  parseInline(text).map(r => toTextRun(r, style));

/** 表格单元格：段落数组，空串也要给一个空段落，否则 Word 会认为文档损坏。 */
const cell = (text: string, opts: { bold?: boolean } = {}): TableCell =>
  new TableCell({
    children: [
      new Paragraph({
        children: inlineRuns(text, { sizeHalfPoints: 20, bold: opts.bold })
      })
    ],
    shading: opts.bold
      ? { type: ShadingType.CLEAR, fill: HEADER_FILL, color: 'auto' }
      : undefined
  });

const TABLE_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' } as const;

const renderTable = (block: Extract<Block, { type: 'table' }>): Table => {
  const colCount = block.headers.length;
  const headerRow = new TableRow({
    tableHeader: true,
    children: block.headers.map(h => cell(h, { bold: true }))
  });
  const bodyRows = block.rows.map(row => {
    // 行的单元格数可能与表头不一致，补齐/截断到表头列数，避免 Word 打不开
    const cells: TableCell[] = [];
    for (let i = 0; i < colCount; i += 1) cells.push(cell(row[i] ?? ''));
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

/** Block[] → docx 的 section children。导出以便单测/离线校验直接调用。 */
export const blocksToDocxChildren = (
  title: string | null,
  blocks: Block[]
): (Paragraph | Table)[] => {
  const children: (Paragraph | Table)[] = [];

  if (title) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: inlineRuns(title, { sizeHalfPoints: 36, bold: true, color: DARK })
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
        children.push(new Paragraph({ children: inlineRuns(block.text) }));
        break;

      case 'bullets':
        for (const item of block.items) {
          children.push(new Paragraph({ bullet: { level: 0 }, children: inlineRuns(item) }));
        }
        break;

      case 'numbered':
        // docx 的编号列表要挂 numbering 配置；这里保持与 Python "List Number" 同等的
        // 视觉效果即可，直接把序号写进文本，避免为一次性文档引入编号定义。
        block.items.forEach((item, idx) => {
          children.push(
            new Paragraph({
              indent: { left: convertMillimetersToTwip(7.5) },
              children: [
                new TextRun({ text: `${idx + 1}. `, font: cnFont }),
                ...inlineRuns(item)
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
        if (block.lang === 'chart') {
          // Python 版在缺少 matplotlib 时的同款降级
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: '（图表未渲染：浏览器端不支持图表生成）',
                  font: cnFont,
                  color: GRAY,
                  size: 18
                })
              ]
            })
          );
          break;
        }
        children.push(
          new Paragraph({
            children: [new TextRun({ text: block.text, font: codeFont, size: 20 })]
          })
        );
        break;

      case 'table':
        if (!block.headers.length) break;
        children.push(renderTable(block));
        // Python 版在表后补一个空段落，否则相邻两张表会粘在一起
        children.push(new Paragraph({ children: [] }));
        break;
    }
  }

  return children;
};

/** Block[] → Document。 */
export const blocksToDocument = (title: string | null, blocks: Block[]): Document =>
  new Document({
    styles: {
      // 让内置样式也用微软雅黑，否则标题/列表会回落到 Calibri + 宋体
      default: {
        document: { run: { font: cnFont, size: 21 } },
        heading1: { run: { font: cnFont, color: DARK, bold: true, size: 32 } },
        heading2: { run: { font: cnFont, color: DARK, bold: true, size: 28 } },
        heading3: { run: { font: cnFont, color: DARK, bold: true, size: 24 } },
        heading4: { run: { font: cnFont, color: DARK, bold: true, size: 22 } }
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
        children: blocksToDocxChildren(title, blocks)
      }
    ]
  });

/** Block[] → .docx Blob（浏览器端）。 */
export const blocksToDocxBlob = (title: string | null, blocks: Block[]): Promise<Blob> =>
  Packer.toBlob(blocksToDocument(title, blocks));
