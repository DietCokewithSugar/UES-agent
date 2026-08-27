import React, { useMemo, useState } from 'react';

import { renderChartsInBlocks } from '../../services/analysis/chartRenderer';
import { parseAnalysisJson } from '../../services/analysis/parseAnalysisJson';
import type { DocFormat } from '../../services/agents/types';
import type { Block } from '../../services/docx/blocks';
import { blocksToDocxBlob } from '../../services/docx/blocksToDocx';
import { parseMarkdown } from '../../services/markdown/parseMarkdown';
import { KIND_LABELS, type GeneratedDoc } from '../../services/uxkit/types';
import { saveFile } from '../../utils/saveFile';
import { BlockView } from './BlockView';

/**
 * 一份产出物的卡片：预览 + 下载。
 *
 * 预览用的 Block 树和生成 .docx 用的是同一棵，所以看到的就是下载到的。
 * 按技能「输出与保存」一节的规定，DOCX 转换失败时降级为 Markdown 交付并说明原因。
 */
interface Props {
  doc: GeneratedDoc;
  /** markdown（ux-kit）还是 analysis.json（ux-analysis），决定用哪个解析器与排版主题 */
  format?: DocFormat;
  /** 正在流式写入时为 true，此时只滚动展示原文、不给下载按钮 */
  streaming?: boolean;
  /** 这份文档是等待用户确认的研究方案时，额外给确认/修改动作 */
  awaitingConfirm?: boolean;
  pending?: boolean;
  onConfirm?: () => void;
  onRevise?: (feedback: string) => void;
}

const PREVIEW_COLLAPSE_THRESHOLD = 2400;

export const DocumentCard: React.FC<Props> = ({
  doc,
  format = 'markdown',
  streaming,
  awaitingConfirm,
  pending,
  onConfirm,
  onRevise
}) => {
  /**
   * 流式过程中 analysis.json 还不是合法 JSON，解析必然失败——
   * 这时先按纯文本展示，等流结束再正式解析。
   */
  const parsed = useMemo((): {
    title: string | null;
    subtitle?: string;
    blocks: Block[];
    raw?: string;
  } => {
    if (format === 'markdown') return parseMarkdown(doc.markdown);
    try {
      return parseAnalysisJson(doc.markdown);
    } catch {
      return { title: null, blocks: [], raw: doc.markdown };
    }
  }, [doc.markdown, format]);
  const isLong = doc.markdown.length > PREVIEW_COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [text, setText] = useState('');

  const collapsed = isLong && !expanded && !streaming;

  const rawExt = format === 'analysisJson' ? '.json' : '.md';
  const rawMime = format === 'analysisJson' ? 'application/json' : 'text/markdown';

  const downloadDocx = async () => {
    setBusy(true);
    setDownloadError(null);
    try {
      // 图表要先画成 PNG——docx 需要图片字节，不能等渲染时再画
      const blocks =
        format === 'analysisJson' ? renderChartsInBlocks(parsed.blocks) : parsed.blocks;
      const blob = await blocksToDocxBlob(parsed.title, blocks, {
        theme: format === 'analysisJson' ? 'analysis' : 'uxkit',
        subtitle: parsed.subtitle
      });
      saveFile(blob, doc.filename);
    } catch (err) {
      // 技能「异常处理」规定的降级路径：保留 markdown 作为交付物并说明原因
      setDownloadError(
        `DOCX 转换未成功（${(err as Error).message}）。已为你提供 ${rawExt} 文件作为降级交付物。`
      );
      saveFile(
        new Blob([doc.markdown], { type: `${rawMime};charset=utf-8` }),
        doc.filename.replace(/\.docx$/, rawExt)
      );
    } finally {
      setBusy(false);
    }
  };

  const downloadRaw = () =>
    saveFile(
      new Blob([doc.markdown], { type: `${rawMime};charset=utf-8` }),
      doc.filename.replace(/\.docx$/, rawExt)
    );

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-slate-900 text-[11px] text-white">
            W
          </span>
          <div>
            <div className="font-mono text-sm font-semibold text-slate-900">{doc.filename}</div>
            <div className="text-[11px] text-slate-500">
              {KIND_LABELS[doc.kind]}
              {streaming && ' · 正在生成…'}
            </div>
          </div>
        </div>
        {!streaming && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadDocx}
              disabled={busy}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? '生成中…' : '下载 .docx'}
            </button>
            <button
              onClick={downloadRaw}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
            >
              下载 {rawExt}
            </button>
          </div>
        )}
      </div>

      {doc.truncated && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          内容在达到模型单次输出上限时被截断，文档可能不完整。可以用下面的「继续补全」让 AI
          接着写，或直接在下载后的文档里补齐。
        </div>
      )}

      {downloadError && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
          {downloadError}
        </div>
      )}

      <div className="relative">
        <div
          className={`rounded-lg border border-slate-200 bg-slate-50/60 p-3 ${
            collapsed ? 'max-h-72 overflow-hidden' : ''
          }`}
        >
          {parsed.title && (
            <div className="mb-2 text-center text-base font-semibold text-slate-900">
              {parsed.title}
            </div>
          )}
          {parsed.subtitle && (
            <div className="mb-3 text-center text-xs text-slate-500">{parsed.subtitle}</div>
          )}
          {parsed.raw !== undefined ? (
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-slate-500">
              {parsed.raw}
            </pre>
          ) : (
            <BlockView blocks={parsed.blocks} />
          )}
          {streaming && <span className="ml-0.5 inline-block animate-pulse text-slate-400">▍</span>}
        </div>
        {collapsed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-lg bg-gradient-to-t from-white to-transparent" />
        )}
      </div>

      {isLong && !streaming && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          {expanded ? '收起预览' : '展开全文预览'}
        </button>
      )}

      {awaitingConfirm && !streaming && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onConfirm}
              disabled={pending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              确认方案，生成材料
            </button>
            <button
              onClick={() => setShowFeedback(s => !s)}
              disabled={pending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
            >
              修改方案
            </button>
          </div>
          {showFeedback && (
            <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
              <textarea
                rows={3}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="想改哪里？例如：样本量太大了，压到 8 人；去掉问卷阶段…"
                value={text}
                onChange={e => setText(e.target.value)}
              />
              <div className="flex justify-end">
                <button
                  disabled={!text.trim() || pending}
                  onClick={() => {
                    onRevise?.(text.trim());
                    setText('');
                    setShowFeedback(false);
                  }}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                >
                  重新生成方案
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentCard;
