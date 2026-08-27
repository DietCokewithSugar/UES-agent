/**
 * analysis.json → Block[]
 *
 * ux-analysis 技能的产出不是 markdown，而是 `skills/ux-analysis/scripts/analysis_builder.py`
 * 定义的一套结构化 JSON（见该脚本的 ANALYSIS_EXAMPLE）。这里把它解析成共用的 Block 树，
 * 之后与 markdown 产出走同一个 docx 渲染器与同一个预览渲染器。
 *
 * 解析全程"宽进"：模型偶尔会漏字段或把数组写成别的形状，单个块坏掉时跳过或降级，
 * 不让整份分析结论解析失败——技能的失败处理细则也是这么要求的。
 */
import type { Block, ChartSpec } from '../docx/blocks';

export interface ParsedAnalysis {
  title: string | null;
  /** 副标题：技能硬约束为「生成日期：YYYY-MM-DD ｜ 方案类型」两项，不含任何数据信息 */
  subtitle?: string;
  note?: string;
  blocks: Block[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : String(x ?? ''))).filter(Boolean) : [];

const numArray = (v: unknown): number[] =>
  Array.isArray(v) ? v.map(x => Number(x)).filter(n => Number.isFinite(n)) : [];

/** `[["名称", [1,2,3]], ...]`；模型有时会写成 `[{name, values}]`，两种都收。 */
const seriesPairs = (v: unknown): [string, number[]][] => {
  if (!Array.isArray(v)) return [];
  const out: [string, number[]][] = [];
  for (const item of v) {
    if (Array.isArray(item) && item.length >= 2) {
      out.push([str(item[0]) || '系列', numArray(item[1])]);
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const name = str(o.name) || str(o.label) || '系列';
      const values = numArray(o.values ?? o.data);
      if (values.length) out.push([name, values]);
    }
  }
  return out.filter(([, vals]) => vals.length > 0);
};

const figsize = (v: unknown): [number, number] | undefined => {
  const arr = numArray(v);
  return arr.length === 2 ? [arr[0], arr[1]] : undefined;
};

/** chart spec 校验：必要字段缺失时返回 null，调用方原位标注「图略」。 */
const parseChartSpec = (raw: unknown): ChartSpec | null => {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const title = str(s.title) || undefined;
  const size = figsize(s.figsize);

  switch (str(s.type)) {
    case 'bar': {
      const labels = strArray(s.labels);
      const series = seriesPairs(s.series);
      if (!labels.length || !series.length) return null;
      return {
        type: 'bar',
        title,
        labels,
        series,
        ylabel: str(s.ylabel) || undefined,
        figsize: size,
        // Python 版字段名是 bar_width（snake_case），这里两种都认
        barWidth: Number(s.barWidth ?? s.bar_width) || undefined
      };
    }
    case 'line': {
      const x = Array.isArray(s.x) ? s.x.map(v => (typeof v === 'number' ? v : String(v))) : [];
      const series = seriesPairs(s.series);
      if (!x.length || !series.length) return null;
      return {
        type: 'line',
        title,
        x,
        series,
        xlabel: str(s.xlabel) || undefined,
        ylabel: str(s.ylabel) || undefined,
        figsize: size
      };
    }
    case 'pie': {
      const labels = strArray(s.labels);
      const values = numArray(s.values);
      if (!labels.length || labels.length !== values.length) return null;
      return { type: 'pie', title, labels, values, figsize: size };
    }
    case 'scatter': {
      const points = Array.isArray(s.points)
        ? s.points
            .map(p => {
              const o = (p || {}) as Record<string, unknown>;
              return { x: Number(o.x), y: Number(o.y), label: str(o.label) || undefined };
            })
            .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
        : [];
      if (!points.length) return null;
      return {
        type: 'scatter',
        title,
        points,
        xlabel: str(s.xlabel) || undefined,
        ylabel: str(s.ylabel) || undefined,
        quadrantLines: (s.quadrantLines ?? s.quadrant_lines ?? true) !== false,
        figsize: size
      };
    }
    case 'funnel': {
      const steps: [string, number][] = Array.isArray(s.steps)
        ? s.steps
            .map(st => {
              if (Array.isArray(st) && st.length >= 2) {
                return [str(st[0]), Number(st[1])] as [string, number];
              }
              const o = (st || {}) as Record<string, unknown>;
              return [str(o.name) || str(o.label), Number(o.value ?? o.count)] as [string, number];
            })
            .filter(([name, v]) => name && Number.isFinite(v))
        : [];
      if (!steps.length) return null;
      return { type: 'funnel', title, steps, xlabel: str(s.xlabel) || undefined, figsize: size };
    }
    case 'radar': {
      const categories = strArray(s.categories);
      const series = seriesPairs(s.series);
      if (categories.length < 3 || !series.length) return null;
      return {
        type: 'radar',
        title,
        categories,
        series,
        legend: s.legend !== false,
        figsize: size
      };
    }
    default:
      return null;
  }
};

const clampLevel = (v: unknown): 1 | 2 | 3 | 4 => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  return (n > 4 ? 4 : n) as 1 | 2 | 3 | 4;
};

const parseBlock = (raw: unknown): Block | null => {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;

  switch (str(b.type)) {
    case 'heading': {
      const text = str(b.text);
      return text ? { type: 'heading', text, level: clampLevel(b.level) } : null;
    }

    case 'paragraph': {
      const text = str(b.text);
      return text ? { type: 'paragraph', text } : null;
    }

    case 'bullets': {
      const items = strArray(b.items);
      return items.length ? { type: 'bullets', items } : null;
    }

    case 'conclusion': {
      const statement = str(b.statement);
      const data = strArray(b.data);
      // 三段都空的 conclusion 没有意义，丢掉
      if (!statement && !data.length) return null;
      return {
        type: 'conclusion',
        statement,
        data,
        interpretation: str(b.interpretation) || undefined,
        confidence: str(b.confidence) || undefined
      };
    }

    case 'table': {
      const headers = strArray(b.headers);
      if (!headers.length) return null;
      const rows = Array.isArray(b.rows)
        ? b.rows.map(r =>
            Array.isArray(r) ? r.map(c => (c === null || c === undefined ? '' : String(c))) : []
          )
        : [];
      return { type: 'table', headers, rows, title: str(b.title) || undefined };
    }

    case 'chart': {
      const spec = parseChartSpec(b.spec);
      const caption = str(b.caption) || undefined;
      if (!spec) {
        // 技能失败处理细则：单个图表失败不影响正文，原位标注「图略」
        return { type: 'paragraph', text: `（图略：图表数据不完整${caption ? ` — ${caption}` : ''}）` };
      }
      return { type: 'chart', spec, caption };
    }

    case 'image': {
      const dataUrl = str(b.dataUrl) || str(b.data_url) || str(b.src);
      if (!dataUrl.startsWith('data:image/')) return null;
      return {
        type: 'image',
        dataUrl,
        caption: str(b.caption) || undefined,
        widthInches: Number(b.widthInches ?? b.width) || undefined
      };
    }

    case 'pagebreak':
      return { type: 'pagebreak' };

    default:
      return null;
  }
};

/**
 * 解析一份 analysis.json。
 * @param raw 已经 JSON.parse 过的对象，或原始字符串
 */
export const parseAnalysisJson = (raw: unknown): ParsedAnalysis => {
  const data: Record<string, unknown> =
    typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : (raw as any) || {};

  const blocks: Block[] = [];
  const rawBlocks = Array.isArray(data.blocks) ? data.blocks : [];
  for (const rb of rawBlocks) {
    const block = parseBlock(rb);
    if (block) blocks.push(block);
  }

  return {
    title: str(data.title) || null,
    subtitle: str(data.subtitle) || undefined,
    note: str(data.note) || undefined,
    blocks
  };
};
