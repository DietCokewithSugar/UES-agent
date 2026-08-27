import React from 'react';

/**
 * 输入框。空态时居中显示，有对话后固定在底部——两处共用这一个组件，
 * 避免两套样式各自漂移。
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
}

export const Composer: React.FC<Props> = ({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  disabled,
  placeholder,
  footer,
  autoFocus
}) => (
  <div className="rounded-2xl border border-slate-300/80 bg-white shadow-sm transition-shadow focus-within:border-slate-400 focus-within:shadow-md">
    <textarea
      rows={2}
      value={value}
      disabled={disabled}
      autoFocus={autoFocus}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (!busy) onSend();
        }
      }}
      placeholder={placeholder}
      className="w-full resize-none rounded-t-2xl bg-transparent px-4 pt-3.5 text-sm leading-6 text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
    />
    <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
      <div className="min-w-0 text-[11px] text-slate-400">{footer}</div>
      {busy ? (
        <button
          onClick={onStop}
          aria-label="停止生成"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <span className="inline-block h-2 w-2 rounded-[2px] bg-slate-500" />
          停止
        </button>
      ) : (
        <button
          onClick={onSend}
          disabled={!value.trim() || disabled}
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

export default Composer;
