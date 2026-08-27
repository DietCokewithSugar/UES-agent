import React from 'react';

import { parseInline, type Block, type InlineRun } from '../../services/markdown/parseMarkdown';

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
            <div key={idx} className="overflow-x-auto">
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
          );

        default:
          return null;
      }
    })}
  </div>
);

export default BlockView;
