import React, { useState } from 'react';

import type { ClarifyOption } from '../../services/uxkit/types';

/**
 * 交互卡片① —— 跟用户确认意图。
 *
 * 对应 ux-kit 技能 Phase 1 的 `question` 工具（`multiple: true` + `custom: true`）：
 * 多选选项 + 自定义补充 + 跳过兜底。技能文档规定选项里不出现"跳过""其他"，
 * 这两个兜底由界面提供，所以模型只需要给真正的方向选项。
 *
 * 提交后卡片冻结为只读的已答态，让对话流保留完整的追问记录。
 */
export interface ClarifyAnswer {
  selected: ClarifyOption[];
  custom: string;
  skipped: boolean;
}

interface Props {
  question: string;
  options: ClarifyOption[];
  note?: string;
  /** 已作答时传入，卡片变成只读回顾 */
  answer?: ClarifyAnswer;
  pending?: boolean;
  onSubmit?: (answer: ClarifyAnswer) => void;
}

export const ClarifyCard: React.FC<Props> = ({
  question,
  options,
  note,
  answer,
  pending,
  onSubmit
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [customText, setCustomText] = useState('');

  const answered = Boolean(answer);
  const selected = options.filter(o => selectedIds.has(o.id));
  const canSubmit = (selected.length > 0 || customText.trim().length > 0) && !pending;

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const answeredIds = new Set((answer?.selected || []).map(s => s.id));

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[11px] text-white">
          ?
        </span>
        我需要先和你校准一下方向（可多选）
      </div>
      <p className="text-sm text-amber-900">{question}</p>
      {note && <p className="text-xs text-amber-700">{note}</p>}

      {/* 竖排一行一个：选项文案往往是一整句带举例的说明，横排方块会被挤成窄条 */}
      <div className="space-y-2">
        {options.map(opt => {
          const checked = answered ? answeredIds.has(opt.id) : selectedIds.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              disabled={pending || answered}
              onClick={() => toggle(opt.id)}
              aria-pressed={checked}
              className={`flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors disabled:cursor-default ${
                checked
                  ? 'border-2 border-amber-500 bg-amber-100/70 shadow-sm'
                  : `border border-amber-200 bg-white ${
                      answered ? 'opacity-60' : 'hover:border-amber-400 hover:shadow-sm'
                    }`
              }`}
            >
              <span
                className={`mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded border text-[10px] ${
                  checked
                    ? 'border-amber-500 bg-amber-500 text-white'
                    : 'border-slate-300 bg-white text-transparent'
                }`}
                aria-hidden
              >
                ✓
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-slate-900">{opt.title}</span>
                  <span className="text-[11px] font-semibold text-amber-600">选项 {opt.id}</span>
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-600">
                  {opt.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {answered ? (
        <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-slate-600">
          {answer!.skipped ? (
            <span>已跳过这一轮校准，沿用 AI 当前理解。</span>
          ) : (
            <>
              <span className="font-semibold text-slate-700">你的回答：</span>
              {answer!.selected.length > 0 && (
                <span> 已选 {answer!.selected.map(s => s.title).join(' / ')}</span>
              )}
              {answer!.custom && <span> · 补充：{answer!.custom}</span>}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3">
            <label className="text-xs font-semibold text-slate-600">
              自定义补充（可选，可与上方选项同时勾选）
            </label>
            <textarea
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              rows={2}
              value={customText}
              placeholder="例如：我们更关心新用户首次使用场景，老用户暂不在范围内…"
              onChange={e => setCustomText(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-amber-800">
              {selected.length > 0
                ? `已选择 ${selected.length} 项${customText.trim() ? ' + 自定义补充' : ''}`
                : customText.trim()
                ? '仅使用自定义补充'
                : '至少勾选一个选项，或填写自定义补充'}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => onSubmit?.({ selected: [], custom: '', skipped: true })}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs disabled:opacity-50"
              >
                跳过这一问
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() =>
                  onSubmit?.({ selected, custom: customText.trim(), skipped: false })
                }
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                提交
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ClarifyCard;
