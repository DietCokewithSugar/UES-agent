import React, { useMemo } from 'react';
import { FrameworkReport, Persona } from '../types';
import { AiDisclaimer } from './report/AiDisclaimer';

interface SummaryReportProps {
  reports: Record<string, FrameworkReport>;
  personas: Persona[];
}

export const SummaryReport: React.FC<SummaryReportProps> = ({ reports, personas }) => {
  const entries = useMemo(
    () =>
      Object.entries(reports)
        .map(([personaId, report]) => ({
          personaId,
          personaName: personas.find((persona) => persona.id === personaId)?.name || personaId,
          report
        }))
        .filter((entry) => !!entry.report),
    [reports, personas]
  );

  const isEtsReport = useMemo(
    () => entries.length > 0 && entries.every((entry) => entry.report.frameworkId === 'ets'),
    [entries]
  );

  const avgScore = useMemo(() => {
    if (!entries.length) return 0;
    const total = entries.reduce((sum, entry) => sum + entry.report.overallScore, 0);
    return Math.round(total / entries.length);
  }, [entries]);

  const dimensionRanking = useMemo(() => {
    const map = new Map<
      string,
      {
        scores: number[];
        comments: Array<{ personaName: string; comment: string }>;
      }
    >();
    entries.forEach(({ report, personaName }) => {
      report.dimensionScores.forEach((item) => {
        const existing = map.get(item.dimension) || { scores: [], comments: [] };
        existing.scores.push(item.score);
        if (item.comment?.trim()) {
          existing.comments.push({
            personaName,
            comment: item.comment.trim()
          });
        }
        map.set(item.dimension, existing);
      });
    });

    return Array.from(map.entries())
      .map(([dimension, value]) => ({
        dimension,
        avg: Math.round(value.scores.reduce((sum, score) => sum + score, 0) / value.scores.length),
        comments: value.comments
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [entries]);

  const heatmapColumns = useMemo(() => {
    if (!entries.length) return [];
    return entries[0].report.dimensionScores.map((item) => item.dimension);
  }, [entries]);

  const heatmapRows = useMemo(
    () =>
      entries.map((entry) => ({
        personaId: entry.personaId,
        personaName: entry.personaName,
        scoresByDimension: entry.report.dimensionScores.reduce((acc: Record<string, number>, item) => {
          acc[item.dimension] = item.score;
          return acc;
        }, {})
      })),
    [entries]
  );

  const experienceHighlight = dimensionRanking[0] || null;
  const experienceShortfall = dimensionRanking[dimensionRanking.length - 1] || null;

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

  const getHeatmapColor = (score: number) => {
    const clamped = Math.max(0, Math.min(100, score));
    const lightness = 95 - (clamped / 100) * 47;
    return `hsl(257 80% ${lightness}%)`;
  };

  const renderExperienceModule = (
    title: string,
    tone: 'highlight' | 'shortfall',
    item: (typeof dimensionRanking)[number] | null
  ) => {
    if (!item) return null;

    return (
      <div
        className={`rounded-xl border p-4 ${
          tone === 'highlight'
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-rose-200 bg-rose-50'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <h4
            className={`text-sm font-semibold ${
              tone === 'highlight' ? 'text-emerald-800' : 'text-rose-800'
            }`}
          >
            {title}
          </h4>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              tone === 'highlight'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-700'
            }`}
          >
            均分 {item.avg}
          </span>
        </div>
        <p
          className={`mt-2 text-sm font-medium ${
            tone === 'highlight' ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {item.dimension}
        </p>
        <ul
          className={`mt-2 list-disc space-y-1 pl-4 text-xs ${
            tone === 'highlight' ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {(item.comments.length ? item.comments : [{ personaName: '', comment: '暂无维度评价说明' }])
            .slice(0, 3)
            .map((comment, index) => (
              <li key={`${item.dimension}-${tone}-${index}`}>
                {comment.personaName ? `${comment.personaName}：` : ''}
                {comment.comment}
              </li>
            ))}
        </ul>
      </div>
    );
  };

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

      {isEtsReport && heatmapColumns.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">角色 × ETS 维度得分热力图</h3>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span>低分</span>
              <div className="h-2 w-20 rounded-full bg-gradient-to-r from-violet-100 to-violet-700" />
              <span>高分</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">颜色越深分数越高，浅色区域表示体验短板。</p>

          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[860px] border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="rounded-md bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700">
                    评测角色
                  </th>
                  {heatmapColumns.map((dimension) => (
                    <th
                      key={dimension}
                      className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"
                    >
                      {dimension}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapRows.map((row) => (
                  <tr key={row.personaId}>
                    <td className="rounded-md bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                      {row.personaName}
                    </td>
                    {heatmapColumns.map((dimension) => {
                      const score = row.scoresByDimension[dimension] ?? 0;
                      return (
                        <td
                          key={`${row.personaId}-${dimension}`}
                          title={`${row.personaName} · ${dimension}：${score}`}
                          className="rounded-md px-3 py-2 text-center text-xs font-semibold"
                          style={{
                            backgroundColor: getHeatmapColor(score),
                            color: score >= 70 ? '#ffffff' : '#1e293b'
                          }}
                        >
                          {score}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(experienceHighlight || experienceShortfall) && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {renderExperienceModule('体验亮点', 'highlight', experienceHighlight)}
          {renderExperienceModule('体验短板', 'shortfall', experienceShortfall)}
        </section>
      )}

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

      <AiDisclaimer />
    </div>
  );
};
