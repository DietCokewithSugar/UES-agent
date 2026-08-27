import React from 'react';

import {
  formatRelative,
  type StoredSession
} from '../../utils/chatHistoryStorage';

/**
 * 历史对话抽屉。会话只存在浏览器 localStorage 里，不上传。
 */
interface Props {
  open: boolean;
  sessions: StoredSession[];
  activeId: string;
  title?: string;
  onClose: () => void;
  onOpenSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onClearAll: () => void;
}

export const HistoryPanel: React.FC<Props> = ({
  open,
  sessions,
  activeId,
  title = '历史对话',
  onClose,
  onOpenSession,
  onDeleteSession,
  onClearAll
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="absolute inset-0 bg-slate-900/20"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative flex h-full w-full max-w-xs flex-col border-r border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="text-[11px] text-slate-500">仅保存在这台设备的浏览器里</div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {sessions.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-slate-400">
              还没有历史对话
            </p>
          ) : (
            <ul className="space-y-1">
              {sessions.map(s => (
                <li key={s.id}>
                  <div
                    className={`group flex items-start gap-2 rounded-lg px-2.5 py-2 ${
                      s.id === activeId ? 'bg-slate-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <button
                      onClick={() => onOpenSession(s.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-sm text-slate-800">{s.title}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {formatRelative(s.updatedAt)}
                        {s.id === activeId && ' · 当前'}
                      </div>
                    </button>
                    <button
                      onClick={() => onDeleteSession(s.id)}
                      aria-label={`删除「${s.title}」`}
                      className="flex-none rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-slate-200 hover:text-slate-600 focus:opacity-100 group-hover:opacity-100"
                    >
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
                        <path
                          d="M3 4.5h10M6.5 4.5V3.5h3v1M5 4.5l.5 8h5l.5-8"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {sessions.length > 0 && (
          <div className="border-t border-slate-200 p-2">
            <button
              onClick={onClearAll}
              className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-700"
            >
              清空全部历史
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};

export default HistoryPanel;
