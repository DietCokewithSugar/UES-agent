import React, { useEffect, useRef } from 'react';

import { drawChart } from '../../services/analysis/chartRenderer';
import type { Block, ChartSpec, InlineRun } from '../../services/docx/blocks';
import { parseInline } from '../../services/markdown/parseMarkdown';

/** 图表预览：与导出 docx 用的是同一套 drawChart，所见即所得。 */
const ChartView: React.FC<{ spec: ChartSpec; caption?: string }> = ({ spec, caption }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = React.useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const [fw, fh] = spec.figsize ?? [8, 4];
    canvas.width = Math.round(fw * 96 * 2);
    canvas.height = Math.round(fh * 96 * 2);
    try {
      drawChart(canvas, spec);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [spec]);

  if (failed) {
    return <p className="text-xs text-slate-500">（图略：图表渲染失败{caption ? ` — ${caption}` : ''}）</p>;
  }
  return (
    <figure className="space-y-1">
      <canvas ref={ref} className="w-full rounded border border-slate-200 bg-white" />
      {caption && (
        <figcaption className="text-center text-xs text-slate-500">{caption}</figcaption>
      )}
    </figure>
  );
};

/**
 * Block[] → React。
 *
 * 与 `services/docx/blocksToDocx.ts` 共用同一棵 Block 树，
 * 所以聊天里预览到的结构和下载到的 .docx 是一致的。
 */

const Inline: React.FC<{ text: string }> = ({ text }) => (
  <>
    {parseInline(text).map((run: InlineRun, i: number) => {
      if (run.code) {
        return (
          <code
            key={i}
            className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800"
          >
            {run.text}
          </code>
        );
      }
      if (run.bold) return <strong key={i} className="font-semibold text-slate-900">{run.text}</strong>;
      if (run.italic) return <em key={i}>{run.text}</em>;
      return <React.Fragment key={i}>{run.text}</React.Fragment>;
    })}
  </>
);

const HEADING_CLASS: Record<number, string> = {
  1: 'text-base font-semibold text-slate-900 mt-4 first:mt-0',
  2: 'text-sm font-semibold text-slate-900 mt-4 first:mt-0',
  3: 'text-sm font-semibold text-slate-800 mt-3 first:mt-0',
  4: 'text-xs font-semibold text-slate-700 mt-3 first:mt-0'
};

export const BlockView: React.FC<{ blocks: Block[] }> = ({ blocks }) => (
  <div className="space-y-2 text-sm leading-6 text-slate-700">
    {blocks.map((block, idx) => {
      switch (block.type) {
        case 'heading':
          return (
            <div key={idx} className={HEADING_CLASS[block.level]}>
              <Inline text={block.text} />
            </div>
          );

        case 'paragraph':
          return (
            <p key={idx}>
              <Inline text={block.text} />
            </p>
          );

        case 'bullets':
          return (
            <ul key={idx} className="list-disc space-y-1 pl-5">
              {block.items.map((item, i) => (
                <li key={i}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          );

        case 'numbered':
          return (
            <ol key={idx} className="list-decimal space-y-1 pl-5">
              {block.items.map((item, i) => (
                <li key={i}>
                  <Inline text={item} />
                </li>
              ))}
            </ol>
          );

        case 'quote':
          return (
            <blockquote
              key={idx}
              className="border-l-2 border-slate-300 pl-3 text-xs leading-6 text-slate-500"
            >
              {block.text.split('\n').map((line, i) => (
                <div key={i}>
                  <Inline text={line} />
                </div>
              ))}
            </blockquote>
          );

        case 'codeblock':
          return (
            <pre
              key={idx}
              className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-100"
            >
              <code>{block.text}</code>
            </pre>
          );

        case 'table':
          return (
            // 宽表格自己横向滚动，不让整个气泡被撑出横向滚动条
            <div key={idx} className="space-y-1">
              {block.title && (
                <div className="text-xs font-semibold text-slate-800">{block.title}</div>
              )}
              <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-xs">
                <thead>
                  <tr>
                    {block.headers.map((h, i) => (
                      <th
                        key={i}
                        className="border border-slate-300 bg-slate-100 px-2 py-1.5 text-left font-semibold text-slate-800"
                      >
                        <Inline text={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {block.headers.map((_, c) => (
                        <td
                          key={c}
                          className="border border-slate-200 px-2 py-1.5 align-top text-slate-700"
                        >
                          <Inline text={row[c] ?? ''} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          );

        case 'conclusion':
          return (
            // 核心结论三段式：结论加粗独立成段 / 关键数据带项目符号 / 可信度与解读合并
            <div key={idx} className="space-y-1.5 border-l-2 border-slate-300 pl-3">
              {block.statement && (
                <p className="font-semibold text-slate-900">
                  <Inline text={block.statement} />
                </p>
              )}
              {block.data.length > 0 && (
                <ul className="space-y-0.5">
                  {block.data.map((d, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="flex-none text-slate-400">•</span>
                      <span className="min-w-0 flex-1">
                        <Inline text={d} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {(block.confidence || block.interpretation) && (
                <p className="text-xs text-slate-500">
                  {[block.confidence, block.interpretation].filter(Boolean).join('；')}
                </p>
              )}
            </div>
          );

        case 'chart':
          return <ChartView key={idx} spec={block.spec} caption={block.caption} />;

        case 'image':
          return (
            <figure key={idx} className="space-y-1">
              <img
                src={block.dataUrl}
                alt={block.caption || '图片'}
                className="mx-auto max-w-full rounded border border-slate-200"
              />
              {block.caption && (
                <figcaption className="text-center text-xs text-slate-500">
                  {block.caption}
                </figcaption>
              )}
            </figure>
          );

        case 'pagebreak':
          return <hr key={idx} className="my-3 border-dashed border-slate-300" />;

        default:
          return null;
      }
    })}
  </div>
);

export default BlockView;
