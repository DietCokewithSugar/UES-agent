import React from 'react';
import { ABComparisonReport, Persona } from '../types';

interface ABSummaryReportProps {
  comparisons: Record<string, ABComparisonReport>;
  personas: Persona[];
}

const winnerLabel = (winner: ABComparisonReport['winner']) => {
  if (winner === 'A') return 'A';
  if (winner === 'B') return 'B';
  return '持平';
};

export const ABSummaryReport: React.FC<ABSummaryReportProps> = ({ comparisons, personas }) => {
  const rows = Object.entries(comparisons) as Array<[string, ABComparisonReport]>;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">A/B 综合对比</h3>
        <p className="text-xs text-slate-500">按角色汇总推荐方案，帮助判断整体更优设计方向。</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="overflow-x-auto">
          <table className="min-w-[720px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="rounded-md bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700">角色</th>
                <th className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">A 总分</th>
                <th className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">B 总分</th>
                <th className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">推荐</th>
                <th className="rounded-md bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700">结论</th>
                <th className="rounded-md bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700">更优方案潜在效果</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([personaId, comparison]) => (
                <tr key={personaId}>
                  <td className="rounded-md bg-white px-3 py-2 text-xs text-slate-700">
                    {personas.find((persona) => persona.id === personaId)?.name || personaId}
                  </td>
                  <td className="rounded-md bg-white px-3 py-2 text-center text-xs text-slate-700">{comparison.overallScoreA}</td>
                  <td className="rounded-md bg-white px-3 py-2 text-center text-xs text-slate-700">{comparison.overallScoreB}</td>
                  <td className="rounded-md bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700">
                    {winnerLabel(comparison.winner)}
                  </td>
                  <td className="rounded-md bg-white px-3 py-2 text-xs text-slate-600">{comparison.summary}</td>
                  <td className="rounded-md bg-white px-3 py-2 text-xs text-slate-600">{comparison.betterOptionAnswer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
