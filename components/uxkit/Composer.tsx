import React, { useRef, useState } from 'react';

import {
  attachmentKindLabel,
  formatBytes,
  type Attachment
} from '../../utils/attachments';

/**
 * 输入框。空态时居中显示，有对话后固定在底部——两处共用这一个组件，
 * 避免两套样式各自漂移。
 *
 * 支持附件的 agent（如 ux-analysis）会显示回形针与拖拽投放区；
 * 不支持的 agent 完全不渲染这部分。
 */
interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** 底部信息条，例如当前调用的技能 */
  footer?: React.ReactNode;
  autoFocus?: boolean;

  /** 附件支持。不传 onAddFiles 即视为不支持附件。 */
  attachments?: Attachment[];
  onAddFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  /** input accept 属性 */
  accept?: string;
  /** 附件正在解析中 */
  parsing?: boolean;
}

const KIND_STYLE: Record<string, string> = {
  text: 'bg-sky-100 text-sky-700',
  sheet: 'bg-emerald-100 text-emerald-700',
  image: 'bg-violet-100 text-violet-700',
  unsupported: 'bg-rose-100 text-rose-700'
};

const AttachmentChip: React.FC<{
  attachment: Attachment;
  onRemove?: () => void;
}> = ({ attachment, onRemove }) => (
  <div
    className={`flex max-w-full items-center gap-2 rounded-lg border px-2 py-1.5 ${
      attachment.kind === 'unsupported'
        ? 'border-rose-200 bg-rose-50'
        : 'border-slate-200 bg-slate-50'
    }`}
    title={attachment.note}
  >
    <span
      className={`flex-none rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        KIND_STYLE[attachment.kind]
      }`}
    >
      {attachmentKindLabel(attachment.kind)}
    </span>
    <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{attachment.name}</span>
    <span className="flex-none text-[10px] text-slate-400">{formatBytes(attachment.size)}</span>
    {onRemove && (
      <button
        onClick={onRemove}
        aria-label={`移除 ${attachment.name}`}
        className="flex-none rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    )}
  </div>
);

export const Composer: React.FC<Props> = ({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  disabled,
  placeholder,
  footer,
  autoFocus,
  attachments = [],
  onAddFiles,
  onRemoveAttachment,
  accept,
  parsing
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const supportsFiles = Boolean(onAddFiles);

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !disabled && !parsing;

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) onAddFiles?.(files);
  };

  return (
    <div
      onDragOver={
        supportsFiles
          ? e => {
              e.preventDefault();
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={supportsFiles ? () => setDragOver(false) : undefined}
      onDrop={
        supportsFiles
          ? e => {
              e.preventDefault();
              setDragOver(false);
              pick(e.dataTransfer?.files ?? null);
            }
          : undefined
      }
      className={`rounded-2xl border bg-white shadow-sm transition-shadow focus-within:shadow-md ${
        dragOver
          ? 'border-slate-500 border-dashed bg-slate-50'
          : 'border-slate-300/80 focus-within:border-slate-400'
      }`}
    >
      {attachments.length > 0 && (
        <div className="flex flex-col gap-1.5 px-3 pt-3">
          {attachments.map(a => (
            <AttachmentChip
              key={a.id}
              attachment={a}
              onRemove={onRemoveAttachment ? () => onRemoveAttachment(a.id) : undefined}
            />
          ))}
        </div>
      )}

      <textarea
        rows={2}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!busy && canSend) onSend();
          }
        }}
        placeholder={dragOver ? '松开即可添加文件…' : placeholder}
        className="w-full resize-none bg-transparent px-4 pt-3.5 text-sm leading-6 text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
      />

      <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          {supportsFiles && (
            <>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={accept}
                className="hidden"
                onChange={e => {
                  pick(e.target.files);
                  e.target.value = ''; // 允许重复选同一个文件
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={disabled || parsing}
                aria-label="添加文件"
                title="添加数据文件（问卷/访谈/埋点/可用性/眼动/用户声音，支持图片）"
                className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
                  <path
                    d="M10.5 5.5L5.7 10.3a1.7 1.7 0 002.4 2.4l5.2-5.2a3 3 0 10-4.2-4.2L3.6 8.6a4.3 4.3 0 106.1 6.1l4.3-4.3"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>
          )}
          <div className="min-w-0 truncate text-[11px] text-slate-400">
            {parsing ? <span className="animate-pulse">正在解析文件…</span> : footer}
          </div>
        </div>

        {busy ? (
          <button
            onClick={onStop}
            aria-label="停止生成"
            className="inline-flex h-8 flex-none items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <span className="inline-block h-2 w-2 rounded-[2px] bg-slate-500" />
            停止
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!canSend}
            aria-label="发送"
            className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-900 text-white transition-colors hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
              <path
                d="M8 13V3M8 3L4 7M8 3l4 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default Composer;
