import React from 'react';
import { ABComparisonReport } from '../types';

interface ABReportViewProps {
  report: ABComparisonReport;
}

const winnerLabel = (winner: ABComparisonReport['winner']) => {
  if (winner === 'A') return '方案 A 更优';
  if (winner === 'B') return '方案 B 更优';
  return '两方案接近';
};

export const ABReportView: React.FC<ABReportViewProps> = ({ report }) => {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800">A/B 对比结论</h3>
        <p className="mt-2 text-sm text-slate-700">{report.summary}</p>
        <p className="mt-1 text-xs text-slate-500">最终建议：{winnerLabel(report.winner)}</p>
        <p className="mt-2 text-xs leading-6 text-slate-600">
          更优方案潜在效果：{report.betterOptionAnswer}
        </p>
        {report.comparabilityNote && (
          <p className="mt-2 text-xs text-amber-700">对比提示：{report.comparabilityNote}</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">维度对比</h3>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="rounded-md bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700">维度</th>
                <th className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">A</th>
                <th className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">B</th>
                <th className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">差值</th>
                <th className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">更优方案</th>
                <th className="rounded-md bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700">说明</th>
              </tr>
            </thead>
            <tbody>
              {report.dimensionComparisons.map((item) => (
                <tr key={item.dimension}>
                  <td className="rounded-md bg-white px-3 py-2 text-xs text-slate-700">{item.dimension}</td>
                  <td className="rounded-md bg-white px-3 py-2 text-center text-xs text-slate-700">{item.scoreA}</td>
                  <td className="rounded-md bg-white px-3 py-2 text-center text-xs text-slate-700">{item.scoreB}</td>
                  <td className="rounded-md bg-white px-3 py-2 text-center text-xs text-slate-700">{item.diff}</td>
                  <td className="rounded-md bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700">
                    {item.winner}
                  </td>
                  <td className="rounded-md bg-white px-3 py-2 text-xs text-slate-600">{item.insight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
