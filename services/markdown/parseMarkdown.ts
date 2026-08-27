import type { Block, InlineRun } from '../docx/blocks';

export type { Block, InlineRun };

/**
 * Markdown → 结构化 Block 解析器
 *
 * 移植自 ux-kit 技能自带的 `skills/ux-kit/scripts/convert_to_docx.py` 的 Step 1
 * （`parse_markdown` / `_parse_inline`）。该脚本是 Python，浏览器端跑不了，
 * 但它定义的解析规则是技能产出文档的权威规格，因此这里逐条对齐移植。
 *
 * Block 的定义在 `services/docx/blocks.ts`（与 analysis.json 共用同一套词汇表）；
 * 本解析器只产出其中的 markdown 子集，不会产出 conclusion / chart / image / pagebreak。
 */

export interface ParsedMarkdown {
  /** 第一个 `# 一级标题`，单独抽出作为文档标题，不再出现在 blocks 里 */
  title: string | null;
  blocks: Block[];
}

/** 与 Python 版 INLINE_RE 等价：捕获 **bold** / *italic* / `code` 三种行内片段。 */
const INLINE_RE = /(\*\*.*?\*\*|\*.*?\*|`[^`]+`)/;

/**
 * 把一行文本拆成 run 片段。对齐 Python 的 `_parse_inline`：
 * 用捕获组 split，保留分隔符，再按前后缀判定类型。
 */
export const parseInline = (text: string): InlineRun[] => {
  const parts = text.split(INLINE_RE);
  const runs: InlineRun[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      runs.push({ text: part.slice(2, -2), bold: true });
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      runs.push({ text: part.slice(1, -1), italic: true });
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      runs.push({ text: part.slice(1, -1), code: true });
    } else {
      runs.push({ text: part });
    }
  }
  return runs;
};

/** 拆一行表格：去掉首尾 `|` 后按 `|` 切分并 trim。对齐 Python 的 `_split_row`。 */
const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(c => c.trim());

const TABLE_SEPARATOR_RE = /^\s*\|[\s:\-|]+\|\s*$/;
const BULLET_RE = /^\s*[-*]\s/;
const NUMBERED_RE = /^\s*\d+\.\s/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})$/;

/**
 * Markdown → { title, blocks }。逐条对齐 Python 版 `parse_markdown` 的分支顺序：
 * 代码块 → 标题 → 表格 → 引用 → 无序列表 → 有序列表 → 分隔线 → 普通段落。
 * 顺序不能随便调整：例如表格判定必须早于段落，引用必须早于段落。
 */
export const parseMarkdown = (md: string): ParsedMarkdown => {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const n = lines.length;
  let title: string | null = null;
  const blocks: Block[] = [];
  let i = 0;

  while (i < n) {
    const line = lines[i];

    // 空行
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // 代码块（含 ```chart）
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      i += 1;
      const codeLines: string[] = [];
      while (i < n && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // 跳过收尾的 ```
      blocks.push({ type: 'codeblock', text: codeLines.join('\n'), lang: lang || undefined });
      continue;
    }

    // 标题
    if (line.startsWith('#')) {
      const hashes = line.length - line.replace(/^#+/, '').length;
      const level = Math.min(hashes, 6);
      const text = line.replace(/^#+/, '').trim();
      if (level === 1 && title === null) {
        title = text;
      } else {
        blocks.push({ type: 'heading', text, level: Math.min(level, 4) as 1 | 2 | 3 | 4 });
      }
      i += 1;
      continue;
    }

    // 表格：当前行以 | 开头，且下一行是分隔行
    if (line.startsWith('|') && i + 1 < n && TABLE_SEPARATOR_RE.test(lines[i + 1])) {
      const headers = splitRow(line);
      i += 2; // 跳过表头 + 分隔行
      const rows: string[][] = [];
      while (i < n && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // 引用块：连续的 > 行合并成一个
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < n && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>+/, '').trim());
        i += 1;
      }
      blocks.push({ type: 'quote', text: quoteLines.join('\n') });
      continue;
    }

    // 无序列表（连续收集）
    if (BULLET_RE.test(line)) {
      const items: string[] = [];
      while (i < n && BULLET_RE.test(lines[i])) {
        items.push(lines[i].trim().replace(BULLET_RE, ''));
        i += 1;
      }
      blocks.push({ type: 'bullets', items });
      continue;
    }

    // 有序列表（连续收集）
    if (NUMBERED_RE.test(line)) {
      const items: string[] = [];
      while (i < n && NUMBERED_RE.test(lines[i])) {
        items.push(lines[i].trim().replace(NUMBERED_RE, ''));
        i += 1;
      }
      blocks.push({ type: 'numbered', items });
      continue;
    }

    // 分隔线：丢弃
    if (HR_RE.test(line.trim())) {
      i += 1;
      continue;
    }

    // 普通段落
    blocks.push({ type: 'paragraph', text: line.trim() });
    i += 1;
  }

  return { title, blocks };
};
