import React, { useState } from 'react';

import type { Proposal } from '../../services/agents/types';

/**
 * 通用提案卡。
 *
 * ux-analysis 的多个确认节点（研究类型确认 / 数据清单确认 / 分析方案确认 /
 * 主题结构审查）形状一致：标题 + 概述 + 若干字段 + 若干条目 + 确认/修改，
 * 所以共用这一张卡，不为每个节点写一个组件。
 *
 * 技能硬性要求「必须等用户明确确认才能进入下一节点」，所以这张卡是流程闸门。
 */
interface Props {
  proposal: Proposal;
  status: 'pending' | 'confirmed' | 'superseded';
  pending?: boolean;
  onConfirm?: () => void;
  onRevise?: (feedback: string) => void;
}

export const ProposalCard: React.FC<Props> = ({
  proposal,
  status,
  pending,
  onConfirm,
  onRevise
}) => {
  const [showFeedback, setShowFeedback] = useState(false);
  const [text, setText] = useState('');

  return (
    <div className="space-y-3 rounded-xl border border-sky-300 bg-sky-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[11px] text-white">
          ✓
        </span>
        <span className="text-sm font-semibold text-sky-900">{proposal.title}</span>
        {proposal.badge && (
          <span className="inline-flex rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white">
            {proposal.badge}
          </span>
        )}
        {status === 'confirmed' && (
          <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-300">
            已确认
          </span>
        )}
        {status === 'superseded' && (
          <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-300">
            已更新
          </span>
        )}
      </div>

      {proposal.summary && (
        <p className="rounded-lg bg-white px-3 py-2.5 text-sm leading-6 text-slate-900 ring-1 ring-sky-200">
          {proposal.summary}
        </p>
      )}

      {proposal.fields && proposal.fields.length > 0 && (
        <div className="space-y-1.5">
          {proposal.fields.map((f, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-20 flex-none pt-0.5 text-[11px] font-semibold tracking-wide text-sky-700">
                {f.label}
              </div>
              <div className="min-w-0 flex-1 text-sm leading-6 text-slate-800">{f.value}</div>
            </div>
          ))}
        </div>
      )}

      {proposal.items && proposal.items.length > 0 && (
        <ul className="space-y-1.5 rounded-lg border border-sky-200 bg-white p-3">
          {proposal.items.map((it, i) => (
            <li key={i} className="text-sm text-slate-800">
              <div className="font-medium text-slate-900">{it.title}</div>
              {it.detail && (
                <div className="mt-0.5 text-xs leading-5 text-slate-600">{it.detail}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {proposal.note && (
        <p className="text-[11px] leading-5 text-slate-500">{proposal.note}</p>
      )}

      {status === 'pending' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onConfirm}
              disabled={pending}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {proposal.confirmLabel || '确认，继续'}
            </button>
            <button
              onClick={() => setShowFeedback(s => !s)}
              disabled={pending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
            >
              {proposal.reviseLabel || '需要调整'}
            </button>
          </div>
          {showFeedback && (
            <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
              <textarea
                rows={3}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="要改哪里？直接说就行…"
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
                  提交调整
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProposalCard;
