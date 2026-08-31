import React, { useEffect, useState } from 'react';

import type { SkillTrace as SkillTraceData } from '../../services/uxkit/types';

/**
 * 可展开的 AI 执行轨迹。
 *
 * 把"这一步调了哪个技能、处在哪个 Phase、实际读了技能目录下的哪些文件"
 * 如实暴露在对话里——展示的文件名来自 referencePicker 真正注入的那一份，
 * 不是写死的装饰。
 */
export const SkillTraceChip: React.FC<{ trace: SkillTraceData; running?: boolean }> = ({
  trace,
  running
}) => {
  const [open, setOpen] = useState(Boolean(running));
  useEffect(() => {
    if (running) setOpen(true);
  }, [running]);

  const files = [
    ...trace.templates.map(t => `templates/${t}`),
    ...trace.references.map(r => `references/${r}`)
  ];
  const steps = trace.steps ?? [];

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-br from-white via-violet-50/60 to-indigo-50/70 shadow-[0_8px_30px_rgba(109,40,217,0.08)] transition-all duration-300">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/60"
          aria-expanded={open}
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-300">
            {running && (
              <span className="absolute inset-0 animate-ping rounded-xl bg-violet-400 opacity-30" />
            )}
            <svg viewBox="0 0 20 20" className="relative h-4 w-4" fill="none" aria-hidden>
              <path d="m11.7 2-7 9h5l-1.4 7 7-10h-5L11.7 2Z" fill="currentColor" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-xs font-semibold text-slate-800">
                {running ? 'AI 正在执行' : 'AI 执行过程'}
              </span>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 font-mono text-[10px] font-medium text-violet-700">
                {trace.skillName}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-slate-500">{trace.phase}</span>
          </span>
          <svg
            viewBox="0 0 20 20"
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ${
              open ? 'rotate-180' : ''
            }`}
            fill="none"
            aria-hidden
          >
            <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>

        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
            open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            <div className="border-t border-violet-100/80 px-4 pb-4 pt-3">
              {trace.summary && (
                <div className="mb-3 rounded-xl border border-white bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600 shadow-sm">
                  <span className="mr-1.5 font-semibold text-violet-700">决策摘要</span>
                  {trace.summary}
                </div>
              )}

              {steps.length > 0 && (
                <div className="relative space-y-0.5">
                  <div className="absolute bottom-3 left-[9px] top-3 w-px bg-violet-100" />
                  {steps.map(step => (
                    <div key={step.id} className="relative flex gap-3 py-1.5">
                      <span
                        className={`relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border text-[9px] transition-all duration-300 ${
                          step.status === 'done'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                            : step.status === 'error'
                              ? 'border-rose-200 bg-rose-50 text-rose-600'
                              : step.status === 'running'
                                ? 'border-violet-300 bg-violet-100 text-violet-700 shadow-[0_0_0_4px_rgba(139,92,246,0.08)]'
                                : 'border-slate-200 bg-white text-slate-400'
                        }`}
                      >
                        {step.status === 'done' ? (
                          '✓'
                        ) : step.status === 'error' ? (
                          '!'
                        ) : step.status === 'running' ? (
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-600" />
                        ) : (
                          '·'
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                          {step.label}
                          <span className="rounded bg-slate-100 px-1 py-px text-[8px] uppercase tracking-wider text-slate-400">
                            {step.kind === 'skill' ? 'skill' : step.kind === 'tool' ? 'tool' : 'think'}
                          </span>
                        </span>
                        {step.detail && (
                          <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">
                            {step.detail}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {files.length > 0 && (
                <div className="mt-3 border-t border-violet-100 pt-3">
                  <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                    已读取资源
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {files.map(f => (
                      <span
                        key={f}
                        className="rounded-md border border-violet-100 bg-white/90 px-2 py-1 font-mono text-[9px] text-violet-700 shadow-sm"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillTraceChip;
