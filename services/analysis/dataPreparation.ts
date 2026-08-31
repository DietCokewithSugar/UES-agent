import type { Attachment } from '../../utils/attachments';
import type { ChartSpec } from '../docx/blocks';

export interface AnalysisChunk {
  source: string;
  kind: Attachment['kind'];
  index: number;
  total: number;
  text?: string;
  imageDataUrl?: string;
}

export interface ColumnProfile {
  name: string;
  nonEmpty: number;
  missing: number;
  distinct: number;
  numeric?: { min: number; max: number; mean: number };
  topValues?: Array<{ value: string; count: number }>;
  redacted?: boolean;
}

export interface TableProfile {
  source: string;
  rows: number;
  columns: ColumnProfile[];
}

export interface PreparedAnalysisData {
  chunks: AnalysisChunk[];
  profiles: TableProfile[];
  recommendedCharts: ChartSpec[];
  manifest: Array<{
    source: string;
    kind: Attachment['kind'];
    characters: number;
    chunks: number;
    note?: string;
  }>;
}

const DEFAULT_CHUNK_CHARS = 14_000;
const PII_HEADER = /姓名|名字|手机号|电话|手机|身份证|证件|账号|邮箱|email|设备号|地址|单位/i;
const STRUCTURED_EXT = /\.(xlsx|csv|tsv)$/i;

const splitOversizedLine = (line: string, limit: number): string[] => {
  if (line.length <= limit) return [line];
  const parts: string[] = [];
  for (let start = 0; start < line.length; start += limit) {
    parts.push(line.slice(start, start + limit));
  }
  return parts;
};

/**
 * 按完整行切块，表格块会重复表头。这样既不截断一条记录，也能让每个块独立解释列含义。
 */
export const splitTextForAnalysis = (
  text: string,
  maxChars = DEFAULT_CHUNK_CHARS,
  repeatHeader = false
): string[] => {
  if (!text.trim()) return [];
  const rawLines = text.split(/\r?\n/);
  const header = repeatHeader ? rawLines.find(line => line.trim() && !line.startsWith('# 工作表：')) : '';
  const lines = rawLines.flatMap(line => splitOversizedLine(line, maxChars));
  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;

  const flush = () => {
    if (!current.length) return;
    chunks.push(current.join('\n'));
    current = [];
    length = 0;
  };

  for (const line of lines) {
    const addition = line.length + (current.length ? 1 : 0);
    if (current.length && length + addition > maxChars) {
      flush();
      if (header && line !== header) {
        current.push(header);
        length = header.length;
      }
    }
    current.push(line);
    length += line.length + (current.length > 1 ? 1 : 0);
  }
  flush();
  return chunks;
};

const parseDelimitedLine = (line: string, delimiter: string): string[] => {
  if (delimiter === '\t') return line.split('\t');
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      cells.push(value);
      value = '';
    } else {
      value += ch;
    }
  }
  cells.push(value);
  return cells;
};

const detectDelimiter = (line: string): string | null => {
  const candidates = ['\t', ',', ';'];
  const best = candidates
    .map(delimiter => ({ delimiter, cells: parseDelimitedLine(line, delimiter).length }))
    .sort((a, b) => b.cells - a.cells)[0];
  return best && best.cells > 1 ? best.delimiter : null;
};

const finiteNumber = (value: string): number | null => {
  const cleaned = value.trim().replace(/[%％,，]/g, '');
  if (!cleaned || !/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
};

/** 对整份表做确定性基础统计；这些数字不经过模型，作为最终分析的事实锚点。 */
export const profileTable = (attachment: Attachment): TableProfile | null => {
  if (!attachment.text || !(attachment.kind === 'sheet' || STRUCTURED_EXT.test(attachment.name))) {
    return null;
  }
  const lines = attachment.text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('# 工作表：'));
  if (lines.length < 2) return null;
  const delimiter = detectDelimiter(lines[0]);
  if (!delimiter) return null;

  const headers = parseDelimitedLine(lines[0], delimiter)
    .slice(0, 100)
    .map((header, index) => header.trim() || `第${index + 1}列`);
  const rows = lines.slice(1).map(line => parseDelimitedLine(line, delimiter).slice(0, headers.length));
  const rowCount = rows.length;
  const columns = headers.map((name, columnIndex): ColumnProfile => {
    const values = rows.map(row => (row[columnIndex] ?? '').trim()).filter(Boolean);
    const missing = rowCount - values.length;
    const unique = new Set(values);
    if (PII_HEADER.test(name)) {
      return {
        name,
        nonEmpty: values.length,
        missing,
        distinct: unique.size,
        redacted: true
      };
    }

    const numbers = values.map(finiteNumber).filter((v): v is number => v !== null);
    if (values.length > 0 && numbers.length / values.length >= 0.8) {
      const sum = numbers.reduce((total, value) => total + value, 0);
      return {
        name,
        nonEmpty: values.length,
        missing,
        distinct: unique.size,
        numeric: {
          min: Math.min(...numbers),
          max: Math.max(...numbers),
          mean: Number((sum / numbers.length).toFixed(4))
        }
      };
    }

    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    const topValues =
      unique.size <= Math.min(50, Math.max(20, Math.round(values.length * 0.5)))
        ? [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([value, count]) => ({ value: value.slice(0, 80), count }))
        : undefined;
    return {
      name,
      nonEmpty: values.length,
      missing,
      distinct: unique.size,
      topValues
    };
  });
  return { source: attachment.name, rows: rowCount, columns };
};

const chartFromProfile = (profile: TableProfile): ChartSpec | null => {
  const column = profile.columns.find(
    item => item.topValues && item.topValues.length >= 2 && item.topValues.length <= 10
  );
  if (!column?.topValues) return null;
  return {
    type: 'bar',
    title: `${column.name}分布`,
    labels: column.topValues.map(item => item.value),
    series: [['样本数', column.topValues.map(item => item.count)]],
    ylabel: '样本数',
    figsize: [7, 4]
  };
};

export const prepareAnalysisData = (
  attachments: Attachment[],
  maxChars = DEFAULT_CHUNK_CHARS
): PreparedAnalysisData => {
  const chunks: AnalysisChunk[] = [];
  const profiles = attachments.map(profileTable).filter((p): p is TableProfile => Boolean(p));
  const manifest: PreparedAnalysisData['manifest'] = [];

  for (const attachment of attachments) {
    if (attachment.kind === 'unsupported') {
      manifest.push({
        source: attachment.name,
        kind: attachment.kind,
        characters: 0,
        chunks: 0,
        note: attachment.note
      });
      continue;
    }
    if (attachment.kind === 'image') {
      chunks.push({
        source: attachment.name,
        kind: attachment.kind,
        index: 1,
        total: 1,
        imageDataUrl: attachment.dataUrl
      });
      manifest.push({
        source: attachment.name,
        kind: attachment.kind,
        characters: 0,
        chunks: 1,
        note: attachment.note
      });
      continue;
    }
    const parts = splitTextForAnalysis(
      attachment.text ?? '',
      maxChars,
      attachment.kind === 'sheet' || STRUCTURED_EXT.test(attachment.name)
    );
    parts.forEach((text, index) =>
      chunks.push({
        source: attachment.name,
        kind: attachment.kind,
        index: index + 1,
        total: parts.length,
        text
      })
    );
    manifest.push({
      source: attachment.name,
      kind: attachment.kind,
      characters: attachment.text?.length ?? 0,
      chunks: parts.length,
      note: attachment.note
    });
  }

  return {
    chunks,
    profiles,
    recommendedCharts: profiles.map(chartFromProfile).filter((c): c is ChartSpec => Boolean(c)),
    manifest
  };
};
