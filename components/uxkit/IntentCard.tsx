import React, { useState } from 'react';

import {
  KIND_LABELS,
  MODE_LABELS,
  type IntentSummary
} from '../../services/uxkit/types';

/**
 * 交互卡片② —— 跟用户总结归纳识别到的意图。
 *
 * 对应 ux-kit 技能 Phase 1 结尾的「研究问题陈述」：技能规定**必须等用户明确确认
 * 才能进入 Phase 2**，所以这张卡是流程的闸门。
 *
 * 卡片上直接列出"确认后会生成哪些文件"——用户一眼就能看出这次走的是
 * 「直接出材料」还是「先出研究方案」。
 */
interface Props {
  intent: IntentSummary;
  status: 'pending' | 'confirmed';
  pending?: boolean;
  onConfirm?: () => void;
  onRevise?: (feedback: string) => void;
}

/** 竖排：标签固定宽度在左，取值在右，三行对齐读起来比三列并排清楚。 */
const Field: React.FC<{ label: string; value: string }> = ({ label, value }) =>
  value ? (
    <div className="flex gap-3">
      <div className="w-16 flex-none pt-0.5 text-[11px] font-semibold tracking-wide text-emerald-700">
        {label}
      </div>
      <div className="min-w-0 flex-1 text-sm leading-6 text-slate-800">{value}</div>
    </div>
  ) : null;

export const IntentCard: React.FC<Props> = ({
  intent,
  status,
  pending,
  onConfirm,
  onRevise
}) => {
  const [showFeedback, setShowFeedback] = useState(false);
  const [text, setText] = useState('');

  const isPlanMode = intent.mode === 'plan';

  return (
    <div className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] text-white">
          ✓
        </span>
        <span className="text-sm font-semibold text-emerald-900">我理解的需求是</span>
        <span className="inline-flex rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
          {MODE_LABELS[intent.mode]}
        </span>
        {status === 'confirmed' && (
          <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-300">
            已确认
          </span>
        )}
        {intent.uncertain && (
          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            存在不确定性
          </span>
        )}
      </div>

      <p className="rounded-lg bg-white px-3 py-2.5 text-sm font-medium leading-6 text-slate-900 ring-1 ring-emerald-200">
        {intent.statement}
      </p>

      <div className="space-y-1.5">
        <Field label="研究对象" value={intent.subject} />
        <Field label="目标人群" value={intent.audience} />
        <Field label="研究意图" value={intent.intent} />
      </div>

      {intent.constraints && intent.constraints.length > 0 && (
        <div className="flex gap-3">
          <div className="w-16 flex-none pt-0.5 text-[11px] font-semibold tracking-wide text-emerald-700">
            约束条件
          </div>
          <ul className="min-w-0 flex-1 list-disc space-y-0.5 pl-4 text-sm leading-6 text-slate-700">
            {intent.constraints.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-emerald-200 bg-white p-3">
        <div className="text-[11px] font-semibold tracking-wide text-emerald-700">
          确认后将生成
        </div>
        <ul className="mt-1.5 space-y-1.5">
          {intent.deliverables.map((d, i) => (
            <li key={i} className="text-sm text-slate-800">
              <span className="font-mono text-[13px] font-semibold text-slate-900">
                {d.filename}
              </span>
              <span className="ml-1.5 text-xs text-slate-500">（{KIND_LABELS[d.kind]}）</span>
              {d.summary && (
                <div className="mt-0.5 text-xs leading-5 text-slate-600">{d.summary}</div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          {isPlanMode
            ? '你的诉求涉及多种材料或尚未指定产出物，所以先出研究方案；方案确认后再按阶段生成访谈提纲 / 问卷 / 测试方案。'
            : '你已经明确了要什么产出物，这一步不需要研究方案，确认后直接生成材料。'}
        </p>
      </div>

      {status === 'pending' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onConfirm}
              disabled={pending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              确认，开始生成
            </button>
            <button
              onClick={() => setShowFeedback(s => !s)}
              disabled={pending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
            >
              不太对，我补充一下
            </button>
          </div>
          {showFeedback && (
            <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
              <textarea
                rows={3}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="哪里不太对？例如：人群应该是老用户；其实我只要问卷…"
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
                  重新理解
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IntentCard;
