import readXlsxFile from 'read-excel-file/browser';
import type { CellValue } from 'read-excel-file/browser';

import { extractTextFromFile } from './documentTextExtractor';

/**
 * 上传文件 → 统一的 Attachment。
 *
 * ux-analysis 技能的 Step 2 就是"上传数据并识别类型"，所以这里负责把各种格式
 * 变成模型能吃的东西：文本类抽成纯文本，图片留 dataURL 交给视觉模型。
 *
 * 单个文件解析失败不抛异常——技能的失败处理细则要求"明确告知用户该文件无法解析
 * 并请求替代格式"，所以失败也返回一个带 note 的 Attachment，让界面能显示原因。
 */

export type AttachmentKind = 'text' | 'sheet' | 'image' | 'unsupported';

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  /** 抽取出的文本（文本 / 表格 / 文档 / PDF） */
  text?: string;
  /** 仅图片：喂给视觉模型的 dataURL */
  dataUrl?: string;
  /** 解析失败或降级的说明 */
  note?: string;
}

/** 单个文件的文本上限：一份问卷导出可能上万行，全塞进上下文会撑爆。 */
const MAX_TEXT_CHARS = 60_000;

/** 图片大小上限。超过就提示用户压缩——base64 会再膨胀 ~33%。 */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;
const SHEET_EXT = /\.xlsx$/i;
const LEGACY_SHEET_EXT = /\.xls$/i;
const PLAIN_EXT = /\.(txt|md|csv|tsv|json|log)$/i;

let seq = 0;
const nextId = () => {
  seq += 1;
  return `att-${Date.now().toString(36)}-${seq}`;
};

const readArrayBuffer = (file: File): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });

const readDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });

/** U+FFFD 替换字符出现得多，说明这个编码猜错了。 */
const mojibakeScore = (s: string): number => {
  const bad = s.match(/�/g)?.length ?? 0;
  return s.length ? bad / s.length : 0;
};

/**
 * 带编码兜底的文本解码。
 *
 * ux-analysis 的 SKILL.md 明确点了这个坑：国内问卷/调研平台导出的 .txt/.csv
 * 常是 GBK/GB2312/GB18030，按 UTF-8 读会整片乱码。所以先试 UTF-8，
 * 发现替换字符过多就换 GB18030 再解一遍，取乱码更少的那个。
 */
export const decodeTextBuffer = (buffer: ArrayBuffer): { text: string; encoding: string } => {
  const bytes = new Uint8Array(buffer);
  // UTF-8 BOM：直接按 utf-8 解，并去掉 BOM
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hasBom ? bytes.subarray(3) : bytes;

  const utf8 = new TextDecoder('utf-8').decode(body);
  const utf8Score = mojibakeScore(utf8);
  if (utf8Score < 0.001) return { text: utf8, encoding: hasBom ? 'utf-8-sig' : 'utf-8' };

  try {
    const gb = new TextDecoder('gb18030').decode(body);
    if (mojibakeScore(gb) < utf8Score) return { text: gb, encoding: 'gb18030' };
  } catch {
    /* 浏览器不支持 gb18030 时退回 UTF-8 结果 */
  }
  return { text: utf8, encoding: hasBom ? 'utf-8-sig' : 'utf-8' };
};

const truncate = (text: string): { text: string; note?: string } =>
  text.length > MAX_TEXT_CHARS
    ? {
        text: text.slice(0, MAX_TEXT_CHARS),
        note: `内容较长，已截取前 ${Math.round(MAX_TEXT_CHARS / 1000)} 千字符供分析`
      }
    : { text };

const cellToText = (cell: CellValue | null): string => {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell);
};

/** 表格 → 制表符分隔的文本，模型对这种形状的表格理解得比 JSON 好。 */
const rowsToText = (rows: (CellValue | null)[][]): string =>
  rows.map(row => row.map(cellToText).join('\t')).join('\n');

export const readAttachment = async (file: File): Promise<Attachment> => {
  const base = {
    id: nextId(),
    name: file.name,
    mime: file.type || '',
    size: file.size
  };
  const name = file.name;

  try {
    // 图片：留 dataURL 给视觉模型
    if (file.type.startsWith('image/') || IMAGE_EXT.test(name)) {
      if (file.size > MAX_IMAGE_BYTES) {
        return {
          ...base,
          kind: 'unsupported',
          note: `图片超过 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB，请压缩后再上传`
        };
      }
      return { ...base, kind: 'image', dataUrl: await readDataUrl(file) };
    }

    // xlsx：只读解析。读全部 sheet——问卷导出常常把数据和码表分在不同标签页
    if (SHEET_EXT.test(name)) {
      const sheets = await readXlsxFile(file);
      const totalRows = sheets.reduce((n, s) => n + s.data.length, 0);
      const body = sheets
        .map(s => (sheets.length > 1 ? `# 工作表：${s.sheet}\n${rowsToText(s.data)}` : rowsToText(s.data)))
        .join('\n\n');
      const { text, note } = truncate(body);
      return {
        ...base,
        kind: 'sheet',
        text,
        note:
          note ??
          `${sheets.length > 1 ? `${sheets.length} 个工作表，` : ''}共 ${totalRows} 行`
      };
    }

    // 老 .xls 不支持，按技能的失败处理细则请求替代格式
    if (LEGACY_SHEET_EXT.test(name)) {
      return {
        ...base,
        kind: 'unsupported',
        note: '不支持旧版 .xls，请在 Excel 中另存为 .xlsx 或导出 .csv 后重新上传'
      };
    }

    // 纯文本类：走编码兜底
    if (PLAIN_EXT.test(name) || file.type.startsWith('text/')) {
      const { text: decoded, encoding } = decodeTextBuffer(await readArrayBuffer(file));
      const { text, note } = truncate(decoded);
      return {
        ...base,
        kind: 'text',
        text,
        note: note ?? (encoding !== 'utf-8' ? `按 ${encoding} 解码` : undefined)
      };
    }

    // docx / pdf：复用已有的抽取器
    const { text, note } = truncate(await extractTextFromFile(file));
    return { ...base, kind: 'text', text, note };
  } catch (err) {
    return {
      ...base,
      kind: 'unsupported',
      note: `解析失败：${(err as Error).message}`
    };
  }
};

export const readAttachments = (files: File[]): Promise<Attachment[]> =>
  Promise.all(files.map(readAttachment));

const KIND_LABEL: Record<AttachmentKind, string> = {
  text: '文本',
  sheet: '表格',
  image: '图片',
  unsupported: '无法解析'
};

export const attachmentKindLabel = (kind: AttachmentKind): string => KIND_LABEL[kind];

export const formatBytes = (n: number): string =>
  n < 1024 ? `${n}B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`;

/** 附件 → 给模型看的文本描述（图片单独走 image_url，不进这里）。 */
export const describeAttachmentsForPrompt = (attachments: Attachment[]): string => {
  const parts: string[] = [];
  for (const a of attachments) {
    if (a.kind === 'image') {
      parts.push(`【图片】${a.name}（随本条消息一并提供，见图）`);
      continue;
    }
    if (a.kind === 'unsupported' || !a.text) {
      parts.push(`【无法解析】${a.name}：${a.note || '未知原因'}`);
      continue;
    }
    parts.push(
      `【${attachmentKindLabel(a.kind)}】${a.name}${a.note ? `（${a.note}）` : ''}\n${a.text}`
    );
  }
  return parts.join('\n\n---\n\n');
};

/**
 * 存进本地历史时的瘦身版本。
 *
 * 图片 dataURL 动辄几 MB，进 localStorage 一条会话就能把配额吃光，
 * 所以只保留元信息；回到旧会话时界面会提示图片需要重新上传。
 */
export const slimAttachmentForStorage = (a: Attachment): Attachment =>
  a.kind === 'image'
    ? { ...a, dataUrl: undefined, note: '（图片未保存到本地历史，如需继续分析请重新上传）' }
    : a;
