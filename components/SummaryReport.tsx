import React, { useMemo } from 'react';
import { Persona, FrameworkReport } from '../types';

interface SummaryReportProps {
  reports: Record<string, FrameworkReport>;
  personas: Persona[];
}

export const SummaryReport: React.FC<SummaryReportProps> = ({ reports, personas }) => {
  const entries = useMemo(
    () =>
      Object.entries(reports)
        .map(([personaId, report]) => ({
          personaName: personas.find((persona) => persona.id === personaId)?.name || personaId,
          report
        }))
        .filter((entry) => !!entry.report),
    [reports, personas]
  );

  const avgScore = useMemo(() => {
    if (!entries.length) return 0;
    const total = entries.reduce((sum, entry) => sum + entry.report.overallScore, 0);
    return Math.round(total / entries.length);
  }, [entries]);

  const dimensionRanking = useMemo(() => {
    const map = new Map<string, number[]>();
    entries.forEach(({ report }) => {
      report.dimensionScores.forEach((item) => {
        const existing = map.get(item.dimension) || [];
        existing.push(item.score);
        map.set(item.dimension, existing);
      });
    });

    return Array.from(map.entries())
      .map(([dimension, scores]) => ({
        dimension,
        avg: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [entries]);

  const issueCount = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.report.issues.length, 0),
    [entries]
  );

  const sharedSuggestions = useMemo(
    () =>
      entries.flatMap(({ personaName, report }) =>
        report.optimizationSuggestions.map((suggestion) => ({ personaName, suggestion }))
      ),
    [entries]
  );

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="text-xs font-semibold text-violet-700">平均总分</p>
          <p className="text-3xl font-bold text-violet-900 mt-1">{avgScore}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-600">评测角色数</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{entries.length}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-700">问题总数</p>
          <p className="text-3xl font-bold text-amber-900 mt-1">{issueCount}</p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">维度平均得分排名</h3>
        <div className="space-y-2">
          {dimensionRanking.map((item) => (
            <div key={item.dimension} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-700">{item.dimension}</span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {item.avg}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">角色差异概览</h3>
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.personaName} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">{entry.personaName}</span>
                <span className="text-xs text-slate-500">总分 {entry.report.overallScore}</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">{entry.report.executiveSummary}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">建议汇总</h3>
        <div className="space-y-2">
          {sharedSuggestions.map((item, index) => (
            <div key={`${item.personaName}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-violet-700 font-semibold mb-1">{item.personaName}</p>
              <p className="text-sm text-slate-700">{item.suggestion}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
