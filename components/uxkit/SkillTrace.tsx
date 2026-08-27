import React from 'react';

import type { SkillTrace as SkillTraceData } from '../../services/uxkit/types';

/**
 * Claude Code 风格的技能调用轨迹。
 *
 * 把"这一步调了哪个技能、处在哪个 Phase、实际读了技能目录下的哪些文件"
 * 如实暴露在对话里——展示的文件名来自 referencePicker 真正注入的那一份，
 * 不是写死的装饰。
 */
export const SkillTraceChip: React.FC<{ trace: SkillTraceData; running?: boolean }> = ({
  trace,
  running
}) => {
  const files = [
    ...trace.templates.map(t => `templates/${t}`),
    ...trace.references.map(r => `references/${r}`)
  ];

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-violet-800">
          <span className={running ? 'animate-pulse' : ''}>⚡</span>
          <span>
            {running ? '正在调用技能' : '已调用技能'}{' '}
            <span className="font-mono">{trace.skillName}</span>
          </span>
          <span className="text-violet-400">·</span>
          <span className="font-normal text-violet-700">{trace.phase}</span>
        </div>
        {files.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {files.map(f => (
              <span
                key={f}
                className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-violet-700 ring-1 ring-violet-200"
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SkillTraceChip;
