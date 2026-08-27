/**
 * 文档块的共用词汇表。
 *
 * 两个来源产出同一棵 Block 树：
 *   - `services/markdown/parseMarkdown.ts`     ← ux-kit 的 markdown 产出
 *   - `services/analysis/parseAnalysisJson.ts` ← ux-analysis 的 analysis.json 产出
 *
 * 两个渲染器消费它：
 *   - `services/docx/blocksToDocx.ts`   → .docx
 *   - `components/uxkit/BlockView.tsx`  → 聊天内预览
 *
 * 所以屏幕上看到的和下载到的结构始终一致，也不需要引入 markdown 渲染依赖。
 * markdown 解析器只会产出前七种；conclusion / chart / image / pagebreak
 * 是 analysis.json 独有的（移植自 skills/ux-analysis/scripts/analysis_builder.py）。
 */

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

/** 图表 spec。字段与 analysis_builder.py 的 `_render_chart` 完全对齐。 */
export type ChartSpec =
  | {
      type: 'bar';
      title?: string;
      labels: string[];
      /** [系列名, 数值列表][] */
      series: [string, number[]][];
      ylabel?: string;
      figsize?: [number, number];
      barWidth?: number;
    }
  | {
      type: 'line';
      title?: string;
      x: (string | number)[];
      series: [string, number[]][];
      xlabel?: string;
      ylabel?: string;
      figsize?: [number, number];
    }
  | {
      type: 'pie';
      title?: string;
      labels: string[];
      values: number[];
      figsize?: [number, number];
    }
  | {
      type: 'scatter';
      title?: string;
      points: { x: number; y: number; label?: string }[];
      xlabel?: string;
      ylabel?: string;
      /** 是否画均值十字线（四象限），默认 true */
      quadrantLines?: boolean;
      figsize?: [number, number];
    }
  | {
      type: 'funnel';
      title?: string;
      /** [步骤名, 人数][] */
      steps: [string, number][];
      xlabel?: string;
      figsize?: [number, number];
    }
  | {
      type: 'radar';
      title?: string;
      categories: string[];
      series: [string, number[]][];
      legend?: boolean;
      figsize?: [number, number];
    };

export type Block =
  | { type: 'heading'; text: string; level: 1 | 2 | 3 | 4 }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'codeblock'; text: string; lang?: string }
  | { type: 'table'; headers: string[]; rows: string[][]; title?: string }
  /**
   * 核心结论三段式（analysis.json）：
   * 一句话结论加粗独立成段 → 关键数据逐条带项目符号 → 可信度与解读合并成一段（可信度在前）。
   */
  | {
      type: 'conclusion';
      statement: string;
      data: string[];
      interpretation?: string;
      confidence?: string;
    }
  /** 图表。`png` 由 chartRenderer 在导出前填入；`error` 是渲染失败时的原位说明。 */
  | { type: 'chart'; spec: ChartSpec; caption?: string; png?: string; error?: string }
  | { type: 'image'; dataUrl: string; caption?: string; widthInches?: number }
  | { type: 'pagebreak' };

/** 文档排版主题。两套产出的排版规范不同，共用渲染器但换一套度量。 */
export type DocTheme = 'uxkit' | 'analysis';
