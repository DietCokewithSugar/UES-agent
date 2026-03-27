import React, { useMemo, useState } from 'react';
import { ChecklistResult, FrameworkReport, Persona } from '../types';
import { AiDisclaimer } from './report/AiDisclaimer';
import { ChecklistStatusBadge } from './report/ChecklistStatusBadge';

interface SummaryReportProps {
  reports: Record<string, FrameworkReport>;
  personas: Persona[];
}

export const SummaryReport: React.FC<SummaryReportProps> = ({ reports, personas }) => {
  const [activeChecklistAnchor, setActiveChecklistAnchor] = useState<string | null>(null);

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

  const hasChecklistSummary = useMemo(
    () => entries.length > 0 && entries.every((entry) => (entry.report.checklistResults || []).length > 0),
    [entries]
  );

  const checklistTemplate = useMemo(() => {
    if (!hasChecklistSummary || !entries.length) return [];
    return entries[0].report.checklistResults || [];
  }, [entries, hasChecklistSummary]);

  const checklistRows = useMemo(() => {
    if (!hasChecklistSummary) return [];
    return checklistTemplate.map((templateItem) => {
      const roleResults = entries.map((entry) => {
        const matched = (entry.report.checklistResults || []).find(
          (result) => result.itemId === templateItem.itemId
        );
        return {
          personaId: entry.personaId,
          personaName: entry.personaName,
          result:
            matched ||
            ({
              itemId: templateItem.itemId,
              status: 'pass',
              reason: '暂无说明',
              category: templateItem.category,
              checkpoint: templateItem.checkpoint,
              item: templateItem.item,
              description: templateItem.description,
              scope: templateItem.scope
            } satisfies ChecklistResult)
        };
      });

      return {
        itemId: templateItem.itemId,
        category: templateItem.category || '',
        checkpoint: templateItem.checkpoint || '',
        item: templateItem.item || '',
        description: templateItem.description || '',
        scope: templateItem.scope || '交互/视觉',
        roleResults
      };
    });
  }, [checklistTemplate, entries, hasChecklistSummary]);

  const checklistFailures = useMemo(() => {
    if (!hasChecklistSummary) return [];
    return checklistRows
      .map((row) => {
        const failedRoles = row.roleResults.filter((roleResult) => roleResult.result.status === 'fail');
        if (!failedRoles.length) return null;
        return {
          id: `failure-${row.itemId}`,
          row,
          failedRoles
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      row: (typeof checklistRows)[number];
      failedRoles: Array<(typeof checklistRows)[number]['roleResults'][number]>;
    }>;
  }, [checklistRows, hasChecklistSummary]);

  const sharedSuggestions = useMemo(
    () =>
      entries.flatMap(({ personaName, report }) =>
        report.optimizationSuggestions.map((suggestion) => ({ personaName, suggestion }))
      ),
    [entries]
  );

  const getHeatmapColor = (score: number) => {
    const clamped = Math.max(0, Math.min(100, score));
    const start = { r: 220, g: 252, b: 231 }; // light green
    const end = { r: 22, g: 101, b: 52 }; // dark green
    const ratio = clamped / 100;
    const r = Math.round(start.r + (end.r - start.r) * ratio);
    const g = Math.round(start.g + (end.g - start.g) * ratio);
    const b = Math.round(start.b + (end.b - start.b) * ratio);
    return `rgb(${r} ${g} ${b})`;
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
              <div className="h-2 w-24 rounded-full bg-gradient-to-r from-green-100 via-green-300 to-green-800" />
              <span>高分</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">颜色从浅绿色到深绿色，颜色越深分数越高，浅色区域表示体验短板。</p>

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
                            color: score >= 60 ? '#ffffff' : '#14532d'
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

          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-600">维度平均得分排名（已融合到热力图）</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {dimensionRanking.map((item, index) => (
                <div
                  key={`rank-${item.dimension}`}
                  className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] text-green-800"
                >
                  <span className="font-semibold">#{index + 1}</span>
                  <span>{item.dimension}</span>
                  <span className="font-semibold">{item.avg}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {hasChecklistSummary && checklistRows.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">设计质量自查表（多角色对比）</h3>
          <p className="text-xs text-slate-500">
            每个角色列仅展示状态徽标；点击“不通过”可定位到下方未通过项说明。
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-[1280px] border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="rounded-md bg-slate-100 px-2 py-2 text-left text-xs font-semibold text-slate-700">检查点</th>
                  <th className="rounded-md bg-slate-100 px-2 py-2 text-left text-xs font-semibold text-slate-700">检查项</th>
                  <th className="rounded-md bg-slate-100 px-2 py-2 text-left text-xs font-semibold text-slate-700">具体说明</th>
                  <th className="rounded-md bg-slate-100 px-2 py-2 text-left text-xs font-semibold text-slate-700">适用范围</th>
                  {entries.map((entry) => (
                    <th
                      key={`persona-col-${entry.personaId}`}
                      className="rounded-md bg-slate-100 px-2 py-2 text-xs font-semibold text-slate-700"
                    >
                      {entry.personaName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checklistRows.map((row) => (
                  <tr key={row.itemId}>
                    <td className="rounded-md bg-white px-2 py-2 text-xs text-slate-700">{row.checkpoint}</td>
                    <td className="rounded-md bg-white px-2 py-2 text-xs text-slate-700">{row.item}</td>
                    <td className="rounded-md bg-white px-2 py-2 text-xs text-slate-600">{row.description}</td>
                    <td className="rounded-md bg-white px-2 py-2 text-xs text-slate-600">{row.scope}</td>
                    {row.roleResults.map((roleResult) => {
                      const anchorId = `failure-${row.itemId}`;
                      const isFail = roleResult.result.status === 'fail';
                      return (
                        <td
                          key={`${row.itemId}-${roleResult.personaId}`}
                          className="rounded-md bg-white px-2 py-2 text-center"
                        >
                          <ChecklistStatusBadge
                            status={roleResult.result.status}
                            onClick={
                              isFail
                                ? () => {
                                    setActiveChecklistAnchor(anchorId);
                                    const target = document.getElementById(anchorId);
                                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    window.setTimeout(() => {
                                      setActiveChecklistAnchor((current) =>
                                        current === anchorId ? null : current
                                      );
                                    }, 1800);
                                  }
                                : undefined
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <h4 className="text-xs font-semibold text-slate-700">未通过项说明</h4>
            {checklistFailures.length ? (
              <div className="mt-2 space-y-2">
                {checklistFailures.map((failure) => (
                  <div
                    id={failure.id}
                    key={failure.id}
                    className={`rounded-lg border p-3 transition ${
                      activeChecklistAnchor === failure.id
                        ? 'border-rose-300 bg-rose-50'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-semibold text-slate-700">
                      {failure.row.checkpoint} · {failure.row.item}
                    </p>
                    <ul className="mt-1 list-disc pl-4 text-xs text-slate-600 space-y-1">
                      {failure.failedRoles.map((failedRole) => (
                        <li key={`${failure.id}-${failedRole.personaId}`}>
                          {failedRole.personaName}：{failedRole.result.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-emerald-700">所有检查项均已通过。</p>
            )}
          </div>
        </section>
      )}

      {(experienceHighlight || experienceShortfall) && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {renderExperienceModule('体验亮点', 'highlight', experienceHighlight)}
          {renderExperienceModule('体验短板', 'shortfall', experienceShortfall)}
        </section>
      )}

      {!isEtsReport && (
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
      )}

      {!hasChecklistSummary && (
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
      )}

      {!hasChecklistSummary && (
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
      )}

      <AiDisclaimer />
    </div>
  );
};
