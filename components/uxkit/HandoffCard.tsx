import React from 'react';

import type { HandoffContext } from '../../services/agents/types';

interface Props {
  handoff: HandoffContext;
}

const Field: React.FC<{ label: string; value?: string }> = ({ label, value }) =>
  value ? (
    <div className="flex gap-3">
      <div className="w-16 flex-none pt-0.5 text-[11px] font-semibold tracking-wide text-violet-700">
        {label}
      </div>
      <div className="min-w-0 flex-1 text-sm leading-6 text-slate-800">{value}</div>
    </div>
  ) : null;

/** 让用户看见从研究助手带入的精简需求记忆。 */
export const HandoffCard: React.FC<Props> = ({ handoff }) => (
  <div className="space-y-3 rounded-xl border border-violet-300 bg-violet-50 p-4">
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[11px] text-white">
        ↗
      </span>
      <span className="text-sm font-semibold text-violet-950">已带入研究助手的需求记忆</span>
      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-300">
        AI 研究助手
      </span>
    </div>

    <p className="rounded-lg bg-white px-3 py-2.5 text-sm font-medium leading-6 text-slate-900 ring-1 ring-violet-200">
      {handoff.statement}
    </p>

    <div className="space-y-1.5">
      <Field label="研究对象" value={handoff.subject} />
      <Field label="目标人群" value={handoff.audience} />
      <Field label="研究目的" value={handoff.intent} />
      <Field label="约束条件" value={handoff.constraints?.join('；')} />
    </div>

    <p className="text-[11px] leading-5 text-violet-700">
      分析助手会以此作为背景，只在分析所需信息确实缺失时再向你确认。
    </p>
  </div>
);

export default HandoffCard;
