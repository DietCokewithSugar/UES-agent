/**
 * 图表渲染（canvas 2D → PNG dataURL）
 *
 * 移植自 `skills/ux-analysis/scripts/analysis_builder.py` 的 `_render_chart`。
 * Python 版用 matplotlib，浏览器端跑不了，所以用 canvas 重画同样的六种图，
 * spec 字段与该脚本逐条对齐（bar/line/pie/scatter/funnel/radar）。
 *
 * 产出 PNG dataURL：既用于 docx 里的 ImageRun，也用于聊天内预览。
 */
import type { Block, ChartSpec } from '../docx/blocks';

/** matplotlib 的 figsize 是英寸，这里按 96dpi 折算，再乘 SCALE 保证 docx 里不糊。 */
const DPI = 96;
const SCALE = 2;
const DEFAULT_FIGSIZE: [number, number] = [8, 4];

const CN_FONT = '"微软雅黑", "Microsoft YaHei", "Noto Sans SC", sans-serif';

/** 与界面配色同源的分类色板。 */
const PALETTE = [
  '#4C78A8',
  '#F58518',
  '#54A24B',
  '#E45756',
  '#72B7B2',
  '#B279A2',
  '#EECA3B',
  '#9D755D'
];

const AXIS = '#8C8C8C';
const GRID = '#E4E4E4';
const TEXT = '#333333';

interface Ctx {
  c: CanvasRenderingContext2D;
  w: number;
  h: number;
}

const font = (size: number, weight = '') => `${weight} ${size * SCALE}px ${CN_FONT}`.trim();

/** 画布可用吗？SSR / 测试环境里没有 document。 */
export const canRenderCharts = (): boolean =>
  typeof document !== 'undefined' && typeof document.createElement === 'function';

const makeCanvas = (spec: ChartSpec): HTMLCanvasElement => {
  const [fw, fh] = spec.figsize ?? DEFAULT_FIGSIZE;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(fw * DPI * SCALE);
  canvas.height = Math.round(fh * DPI * SCALE);
  return canvas;
};

/** 文字过长时截断，避免坐标轴标签互相压住。 */
const ellipsis = (c: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
  if (c.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && c.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
};

const drawTitle = (ctx: Ctx, title?: string): number => {
  if (!title) return 12 * SCALE;
  ctx.c.fillStyle = TEXT;
  ctx.c.font = font(14, 'bold');
  ctx.c.textAlign = 'center';
  ctx.c.textBaseline = 'top';
  ctx.c.fillText(title, ctx.w / 2, 10 * SCALE);
  return 34 * SCALE;
};

const drawLegend = (ctx: Ctx, names: string[], top: number): number => {
  if (names.length < 2) return 0;
  const { c } = ctx;
  c.font = font(11);
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  const gap = 14 * SCALE;
  const box = 10 * SCALE;
  const widths = names.map(n => box + 5 * SCALE + c.measureText(n).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (names.length - 1);
  let x = (ctx.w - total) / 2;
  const y = top + 8 * SCALE;
  names.forEach((n, i) => {
    c.fillStyle = PALETTE[i % PALETTE.length];
    c.fillRect(x, y - box / 2, box, box);
    c.fillStyle = TEXT;
    c.fillText(n, x + box + 5 * SCALE, y);
    x += widths[i] + gap;
  });
  return 22 * SCALE;
};

/** 画 y 轴刻度 + 横向网格线，返回 [值→像素] 映射。 */
const drawYAxis = (
  ctx: Ctx,
  plot: { left: number; right: number; top: number; bottom: number },
  min: number,
  max: number,
  label?: string
) => {
  const { c } = ctx;
  const ticks = 5;
  const span = max - min || 1;
  c.font = font(10);
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  for (let i = 0; i <= ticks; i += 1) {
    const v = min + (span * i) / ticks;
    const y = plot.bottom - ((v - min) / span) * (plot.bottom - plot.top);
    c.strokeStyle = GRID;
    c.lineWidth = 1 * SCALE;
    c.beginPath();
    c.moveTo(plot.left, y);
    c.lineTo(plot.right, y);
    c.stroke();
    c.fillStyle = AXIS;
    const txt = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '');
    c.fillText(txt, plot.left - 6 * SCALE, y);
  }
  if (label) {
    c.save();
    c.translate(12 * SCALE, (plot.top + plot.bottom) / 2);
    c.rotate(-Math.PI / 2);
    c.fillStyle = AXIS;
    c.font = font(11);
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.fillText(label, 0, 0);
    c.restore();
  }
  return (v: number) => plot.bottom - ((v - min) / span) * (plot.bottom - plot.top);
};

/** 数据范围 → 好看的 [min, max]（0 起点，除非有负值）。 */
const niceRange = (values: number[]): [number, number] => {
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values, 0);
  if (hi === lo) return [lo, lo + 1];
  const pad = (hi - lo) * 0.1;
  return [lo < 0 ? lo - pad : 0, hi + pad];
};

const drawBar = (ctx: Ctx, spec: Extract<ChartSpec, { type: 'bar' }>) => {
  const { c } = ctx;
  let top = drawTitle(ctx, spec.title);
  top += drawLegend(ctx, spec.series.map(s => s[0]), top);
  const plot = {
    left: 52 * SCALE,
    right: ctx.w - 16 * SCALE,
    top: top + 8 * SCALE,
    bottom: ctx.h - 46 * SCALE
  };
  const all = spec.series.flatMap(s => s[1]);
  const [min, max] = niceRange(all);
  const toY = drawYAxis(ctx, plot, min, max, spec.ylabel);

  const n = spec.labels.length;
  const slot = (plot.right - plot.left) / n;
  const nser = spec.series.length;
  const bw = Math.min(slot * (spec.barWidth ?? 0.6) / nser, 48 * SCALE);

  spec.series.forEach(([, vals], si) => {
    c.fillStyle = PALETTE[si % PALETTE.length];
    vals.forEach((v, i) => {
      const cx = plot.left + slot * (i + 0.5) + (si - (nser - 1) / 2) * bw;
      const y = toY(v);
      const y0 = toY(Math.max(min, 0));
      c.fillRect(cx - bw / 2, Math.min(y, y0), bw, Math.abs(y0 - y));
    });
  });

  // x 轴标签
  c.fillStyle = AXIS;
  c.font = font(10);
  c.textAlign = 'center';
  c.textBaseline = 'top';
  spec.labels.forEach((label, i) => {
    const cx = plot.left + slot * (i + 0.5);
    c.fillText(ellipsis(c, label, slot * 0.95), cx, plot.bottom + 8 * SCALE);
  });
};

const drawLine = (ctx: Ctx, spec: Extract<ChartSpec, { type: 'line' }>) => {
  const { c } = ctx;
  let top = drawTitle(ctx, spec.title);
  top += drawLegend(ctx, spec.series.map(s => s[0]), top);
  const plot = {
    left: 52 * SCALE,
    right: ctx.w - 16 * SCALE,
    top: top + 8 * SCALE,
    bottom: ctx.h - 46 * SCALE
  };
  const all = spec.series.flatMap(s => s[1]);
  const [min, max] = niceRange(all);
  const toY = drawYAxis(ctx, plot, min, max, spec.ylabel);

  const n = spec.x.length;
  const step = n > 1 ? (plot.right - plot.left) / (n - 1) : 0;
  const toX = (i: number) => (n > 1 ? plot.left + step * i : (plot.left + plot.right) / 2);

  spec.series.forEach(([, vals], si) => {
    const color = PALETTE[si % PALETTE.length];
    c.strokeStyle = color;
    c.lineWidth = 2 * SCALE;
    c.beginPath();
    vals.forEach((v, i) => {
      const x = toX(i);
      const y = toY(v);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.stroke();
    c.fillStyle = color;
    vals.forEach((v, i) => {
      c.beginPath();
      c.arc(toX(i), toY(v), 3 * SCALE, 0, Math.PI * 2);
      c.fill();
    });
  });

  c.fillStyle = AXIS;
  c.font = font(10);
  c.textAlign = 'center';
  c.textBaseline = 'top';
  spec.x.forEach((label, i) => {
    c.fillText(ellipsis(c, String(label), step || 60 * SCALE), toX(i), plot.bottom + 8 * SCALE);
  });
  if (spec.xlabel) {
    c.font = font(11);
    c.fillText(spec.xlabel, (plot.left + plot.right) / 2, ctx.h - 20 * SCALE);
  }
};

const drawPie = (ctx: Ctx, spec: Extract<ChartSpec, { type: 'pie' }>) => {
  const { c } = ctx;
  const top = drawTitle(ctx, spec.title);
  const total = spec.values.reduce((a, b) => a + b, 0) || 1;
  const cx = ctx.w / 2;
  const cy = (top + ctx.h) / 2;
  const r = Math.min(ctx.w, ctx.h - top) * 0.32;

  // matplotlib 的 startangle=90，即从 12 点方向开始
  let angle = -Math.PI / 2;
  spec.values.forEach((v, i) => {
    const sweep = (v / total) * Math.PI * 2;
    c.fillStyle = PALETTE[i % PALETTE.length];
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, r, angle, angle + sweep);
    c.closePath();
    c.fill();

    // 百分比标在扇区中部（对齐 autopct="%1.1f%%"）
    const mid = angle + sweep / 2;
    const lx = cx + Math.cos(mid) * r * 0.62;
    const ly = cy + Math.sin(mid) * r * 0.62;
    c.fillStyle = '#FFFFFF';
    c.font = font(11, 'bold');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (sweep > 0.25) c.fillText(`${((v / total) * 100).toFixed(1)}%`, lx, ly);

    // 类别名标在扇区外
    const ox = cx + Math.cos(mid) * r * 1.14;
    const oy = cy + Math.sin(mid) * r * 1.14;
    c.fillStyle = TEXT;
    c.font = font(11);
    c.textAlign = Math.cos(mid) >= 0 ? 'left' : 'right';
    c.fillText(spec.labels[i] ?? '', ox, oy);

    angle += sweep;
  });
};

const drawScatter = (ctx: Ctx, spec: Extract<ChartSpec, { type: 'scatter' }>) => {
  const { c } = ctx;
  const top = drawTitle(ctx, spec.title);
  const plot = {
    left: 56 * SCALE,
    right: ctx.w - 20 * SCALE,
    top: top + 8 * SCALE,
    bottom: ctx.h - 46 * SCALE
  };
  const xs = spec.points.map(p => p.x);
  const ys = spec.points.map(p => p.y);
  const padX = (Math.max(...xs) - Math.min(...xs)) * 0.15 || 1;
  const padY = (Math.max(...ys) - Math.min(...ys)) * 0.15 || 1;
  const xMin = Math.min(...xs) - padX;
  const xMax = Math.max(...xs) + padX;
  const yMin = Math.min(...ys) - padY;
  const yMax = Math.max(...ys) + padY;
  const toY = drawYAxis(ctx, plot, yMin, yMax, spec.ylabel ?? '置信度');
  const toX = (v: number) =>
    plot.left + ((v - xMin) / (xMax - xMin || 1)) * (plot.right - plot.left);

  // 均值十字线：四象限
  if (spec.quadrantLines !== false) {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    c.strokeStyle = '#999999';
    c.lineWidth = 1 * SCALE;
    c.setLineDash([5 * SCALE, 4 * SCALE]);
    c.beginPath();
    c.moveTo(plot.left, toY(my));
    c.lineTo(plot.right, toY(my));
    c.moveTo(toX(mx), plot.top);
    c.lineTo(toX(mx), plot.bottom);
    c.stroke();
    c.setLineDash([]);
  }

  spec.points.forEach((p, i) => {
    c.fillStyle = PALETTE[i % PALETTE.length];
    c.beginPath();
    c.arc(toX(p.x), toY(p.y), 6 * SCALE, 0, Math.PI * 2);
    c.fill();
    if (p.label) {
      c.fillStyle = TEXT;
      c.font = font(10);
      c.textAlign = 'left';
      c.textBaseline = 'bottom';
      c.fillText(p.label, toX(p.x) + 8 * SCALE, toY(p.y) - 4 * SCALE);
    }
  });

  c.fillStyle = AXIS;
  c.font = font(11);
  c.textAlign = 'center';
  c.textBaseline = 'top';
  c.fillText(spec.xlabel ?? '影响度', (plot.left + plot.right) / 2, ctx.h - 22 * SCALE);
};

const drawFunnel = (ctx: Ctx, spec: Extract<ChartSpec, { type: 'funnel' }>) => {
  const { c } = ctx;
  const top = drawTitle(ctx, spec.title);
  const labelW = 96 * SCALE;
  const vals = spec.steps.map(s => s[1]);
  const max = Math.max(...vals) || 1;
  const first = vals[0] || 0;

  // 右侧要放「人数 (转化率)」，按最宽的一条实测预留，否则最长的一行会被画布裁掉
  c.font = font(11);
  const valueTexts = vals.map(v => `${v}${first ? `  (${((100 * v) / first).toFixed(1)}%)` : ''}`);
  const valueW = Math.max(...valueTexts.map(t => c.measureText(t).width)) + 16 * SCALE;

  const plot = {
    left: labelW,
    right: ctx.w - valueW,
    top: top + 8 * SCALE,
    bottom: ctx.h - 34 * SCALE
  };
  const rowH = (plot.bottom - plot.top) / spec.steps.length;
  const barH = Math.min(rowH * 0.62, 40 * SCALE);

  spec.steps.forEach(([name, v], i) => {
    const y = plot.top + rowH * (i + 0.5);
    const w = ((v / max) * (plot.right - plot.left)) || 1;
    c.fillStyle = PALETTE[0];
    c.fillRect(plot.left, y - barH / 2, w, barH);

    c.fillStyle = TEXT;
    c.font = font(11);
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    c.fillText(ellipsis(c, name, labelW - 12 * SCALE), plot.left - 8 * SCALE, y);

    // 相对首步的转化率（对齐 Python 版的 rate 标注）
    c.fillStyle = AXIS;
    c.textAlign = 'left';
    c.fillText(valueTexts[i], plot.left + w + 8 * SCALE, y);
  });

  c.fillStyle = AXIS;
  c.font = font(11);
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  c.fillText(spec.xlabel ?? '人数', (plot.left + plot.right) / 2, ctx.h - 8 * SCALE);
};

const drawRadar = (ctx: Ctx, spec: Extract<ChartSpec, { type: 'radar' }>) => {
  const { c } = ctx;
  let top = drawTitle(ctx, spec.title);
  if (spec.legend !== false) top += drawLegend(ctx, spec.series.map(s => s[0]), top);

  const cx = ctx.w / 2;
  const cy = (top + ctx.h) / 2;
  const r = Math.min(ctx.w, ctx.h - top) * 0.33;
  const n = spec.categories.length;
  const max = Math.max(...spec.series.flatMap(s => s[1]), 1);
  const angleAt = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;

  // 蛛网
  c.strokeStyle = GRID;
  c.lineWidth = 1 * SCALE;
  for (let ring = 1; ring <= 4; ring += 1) {
    c.beginPath();
    for (let i = 0; i <= n; i += 1) {
      const a = angleAt(i % n);
      const rr = (r * ring) / 4;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
  for (let i = 0; i < n; i += 1) {
    const a = angleAt(i);
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    c.stroke();
  }

  spec.series.forEach(([, vals], si) => {
    const color = PALETTE[si % PALETTE.length];
    c.strokeStyle = color;
    c.lineWidth = 2 * SCALE;
    c.beginPath();
    for (let i = 0; i <= n; i += 1) {
      const idx = i % n;
      const a = angleAt(idx);
      const rr = (r * (vals[idx] ?? 0)) / max;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.stroke();
    c.fillStyle = `${color}22`;
    c.fill();
  });

  // 维度名
  c.fillStyle = TEXT;
  c.font = font(11);
  c.textBaseline = 'middle';
  spec.categories.forEach((cat, i) => {
    const a = angleAt(i);
    const x = cx + Math.cos(a) * (r + 16 * SCALE);
    const y = cy + Math.sin(a) * (r + 16 * SCALE);
    c.textAlign = Math.abs(Math.cos(a)) < 0.2 ? 'center' : Math.cos(a) > 0 ? 'left' : 'right';
    c.fillText(cat, x, y);
  });
};

/** 把 spec 画到 canvas 上。导出以便预览组件直接复用同一套绘制逻辑。 */
export const drawChart = (canvas: HTMLCanvasElement, spec: ChartSpec): void => {
  const c = canvas.getContext('2d');
  if (!c) throw new Error('无法获取 canvas 2D 上下文');
  const ctx: Ctx = { c, w: canvas.width, h: canvas.height };

  c.fillStyle = '#FFFFFF';
  c.fillRect(0, 0, ctx.w, ctx.h);

  switch (spec.type) {
    case 'bar':
      drawBar(ctx, spec);
      break;
    case 'line':
      drawLine(ctx, spec);
      break;
    case 'pie':
      drawPie(ctx, spec);
      break;
    case 'scatter':
      drawScatter(ctx, spec);
      break;
    case 'funnel':
      drawFunnel(ctx, spec);
      break;
    case 'radar':
      drawRadar(ctx, spec);
      break;
  }
};

/** spec → PNG dataURL。失败返回 null，由调用方原位标注「图略」。 */
export const renderChartToDataUrl = (spec: ChartSpec): string | null => {
  if (!canRenderCharts()) return null;
  try {
    const canvas = makeCanvas(spec);
    drawChart(canvas, spec);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
};

/**
 * 导出前把所有 chart 块渲染成 PNG。
 *
 * docx 需要图片字节，不能等到渲染时再画，所以导出前先走一遍。
 * 单张失败只标注该张，不影响正文——技能的失败处理细则要求如此。
 */
export const renderChartsInBlocks = (blocks: Block[]): Block[] =>
  blocks.map(b => {
    if (b.type !== 'chart' || b.png) return b;
    const png = renderChartToDataUrl(b.spec);
    return png ? { ...b, png } : { ...b, error: '图表渲染失败' };
  });
