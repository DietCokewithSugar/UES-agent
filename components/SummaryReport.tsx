import React, { useMemo, useState } from 'react';
import { Persona, ETSReport } from '../types';
import {
  Award, Users, AlertTriangle, Lightbulb,
  TrendingUp, TrendingDown, Flame, MapPin, Zap,
  ChevronDown, ChevronUp
} from 'lucide-react';

// ======== Helper Functions ========

function getScoreColor(score: number): { bg: string; text: string } {
  if (score >= 90) return { bg: '#047857', text: '#FFFFFF' };
  if (score >= 80) return { bg: '#059669', text: '#FFFFFF' };
  if (score >= 70) return { bg: '#34D399', text: '#064E3B' };
  if (score >= 60) return { bg: '#6EE7B7', text: '#064E3B' };
  if (score >= 50) return { bg: '#D1FAE5', text: '#065F46' };
  if (score >= 40) return { bg: '#FEF3C7', text: '#92400E' };
  if (score >= 30) return { bg: '#FECACA', text: '#991B1B' };
  return { bg: '#FCA5A5', text: '#7F1D1D' };
}

function getScoreLevel(score: number): string {
  if (score >= 85) return '优秀';
  if (score >= 70) return '良好';
  if (score >= 55) return '一般';
  return '待改进';
}

// ======== Interfaces ========

interface SummaryReportProps {
  reports: Record<string, ETSReport>;
  personas: Persona[];
}

// ======== Component ========

export const SummaryReport: React.FC<SummaryReportProps> = ({ reports, personas }) => {

  // --- Data Processing ---

  const reportEntries = useMemo(() => {
    return Object.entries(reports)
      .map(([personaId, report]) => ({
        personaId,
        persona: personas.find(p => p.id === personaId)!,
        report
      }))
      .filter(e => e.persona);
  }, [reports, personas]);

  const personaCount = reportEntries.length;

  const dimensions = useMemo(() => {
    if (reportEntries.length === 0) return [];
    return reportEntries[0].report.dimensionScores.map(d => d.dimension);
  }, [reportEntries]);

  const avgOverallScore = useMemo(() => {
    if (personaCount === 0) return 0;
    const sum = reportEntries.reduce((acc, e) => acc + e.report.overallScore, 0);
    return Math.round(sum / personaCount);
  }, [reportEntries, personaCount]);

  const dimensionStats = useMemo(() => {
    const stats: Record<string, {
      scores: number[];
      comments: { persona: string; score: number; comment: string }[];
      sum: number;
      count: number;
    }> = {};

    reportEntries.forEach(({ persona, report }) => {
      report.dimensionScores.forEach(ds => {
        if (!stats[ds.dimension]) {
          stats[ds.dimension] = { scores: [], comments: [], sum: 0, count: 0 };
        }
        stats[ds.dimension].scores.push(ds.score);
        stats[ds.dimension].comments.push({
          persona: persona.name,
          score: ds.score,
          comment: ds.comment
        });
        stats[ds.dimension].sum += ds.score;
        stats[ds.dimension].count++;
      });
    });

    return Object.entries(stats).map(([dimension, data]) => ({
      dimension,
      average: Math.round(data.sum / data.count),
      min: Math.min(...data.scores),
      max: Math.max(...data.scores),
      range: Math.max(...data.scores) - Math.min(...data.scores),
      bestComment: data.comments.sort((a, b) => b.score - a.score)[0],
      worstComment: data.comments.sort((a, b) => a.score - b.score)[0],
    })).sort((a, b) => b.average - a.average);
  }, [reportEntries]);

  const strengths = dimensionStats.slice(0, 3);
  const weaknesses = [...dimensionStats].reverse().slice(0, 3);

  const allIssues = useMemo(() => {
    return reportEntries.flatMap(({ persona, report }) =>
      report.issues.map(issue => ({ ...issue, personaName: persona.name }))
    );
  }, [reportEntries]);

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { '一级问题': 0, '二级问题': 0, '三级问题': 0 };
    allIssues.forEach(issue => {
      if (issue.severity in counts) {
        counts[issue.severity]++;
      }
    });
    return counts;
  }, [allIssues]);

  const totalIssues = allIssues.length;

  // Issue hotspots - locations where multiple personas found issues
  const issueHotspots = useMemo(() => {
    const locationMap: Record<string, {
      personas: Set<string>;
      issues: Array<{ description: string; severity: string; personaName: string }>;
    }> = {};

    allIssues.forEach(issue => {
      if (!locationMap[issue.location]) {
        locationMap[issue.location] = { personas: new Set(), issues: [] };
      }
      locationMap[issue.location].personas.add(issue.personaName);
      locationMap[issue.location].issues.push({
        description: issue.description,
        severity: issue.severity,
        personaName: issue.personaName
      });
    });

    return Object.entries(locationMap)
      .filter(([, data]) => data.personas.size >= 2)
      .map(([location, data]) => ({
        location,
        personaCount: data.personas.size,
        personaNames: Array.from(data.personas),
        issues: data.issues
      }))
      .sort((a, b) => b.personaCount - a.personaCount);
  }, [allIssues]);

  // Issues grouped by severity
  const groupedIssues = useMemo(() => {
    const severityOrder = ['一级问题', '二级问题', '三级问题'];
    const groups: Record<string, Array<{
      description: string;
      location: string;
      recommendation: string;
      personaName: string;
    }>> = {};

    allIssues.forEach(issue => {
      if (!groups[issue.severity]) groups[issue.severity] = [];
      groups[issue.severity].push({
        description: issue.description,
        location: issue.location,
        recommendation: issue.recommendation,
        personaName: issue.personaName
      });
    });

    return severityOrder
      .filter(s => groups[s] && groups[s].length > 0)
      .map(severity => ({
        severity,
        count: groups[severity].length,
        issues: groups[severity]
      }));
  }, [allIssues]);

  // All suggestions
  const allSuggestions = useMemo(() => {
    return reportEntries.flatMap(({ persona, report }) =>
      report.optimizationSuggestions.map(s => ({
        text: s,
        personaName: persona.name
      }))
    );
  }, [reportEntries]);

  const totalSuggestions = allSuggestions.length;

  // Heatmap data
  const heatmapRows = useMemo(() => {
    return reportEntries.map(({ persona, report }) => {
      const dimScores: Record<string, { score: number; comment: string }> = {};
      report.dimensionScores.forEach(ds => {
        dimScores[ds.dimension] = { score: ds.score, comment: ds.comment };
      });
      return {
        personaName: persona.name,
        overallScore: report.overallScore,
        dimScores
      };
    });
  }, [reportEntries]);

  const dimAverages = useMemo(() => {
    const avgs: Record<string, number> = {};
    dimensionStats.forEach(ds => { avgs[ds.dimension] = ds.average; });
    return avgs;
  }, [dimensionStats]);

  // --- UI State ---

  const [tooltipData, setTooltipData] = useState<{
    persona: string;
    dimension: string;
    score: number;
    comment: string;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const [expandedSeverities, setExpandedSeverities] = useState<Record<string, boolean>>({
    '一级问题': true,
    '二级问题': true,
    '三级问题': false
  });

  const toggleSeverity = (severity: string) => {
    setExpandedSeverities(prev => ({ ...prev, [severity]: !prev[severity] }));
  };

  // --- Severity styling ---
  const severityStyles: Record<string, { bg: string; color: string; barColor: string }> = {
    '一级问题': { bg: 'linear-gradient(145deg, #FEE2E2 0%, #FECACA 100%)', color: '#DC2626', barColor: '#EF4444' },
    '二级问题': { bg: 'linear-gradient(145deg, #FFEDD5 0%, #FED7AA 100%)', color: '#EA580C', barColor: '#F97316' },
    '三级问题': { bg: 'linear-gradient(145deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#2563EB', barColor: '#3B82F6' },
  };

  // ======== Render ========

  return (
    <div className="space-y-8 pb-8">

      {/* === Section 1: Key Metrics === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Average Score */}
        <div className="clay-card p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            <Award size={16} className="text-accent-violet" />
            <span className="text-xs font-semibold text-clay-500 uppercase tracking-wider">平均总分</span>
          </div>
          <div className="text-3xl font-bold text-clay-800 font-display">{avgOverallScore}</div>
          <div className="text-xs text-clay-500 mt-1">{getScoreLevel(avgOverallScore)}</div>
        </div>

        {/* Persona Count */}
        <div className="clay-card p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-accent-sky" />
            <span className="text-xs font-semibold text-clay-500 uppercase tracking-wider">评估角色</span>
          </div>
          <div className="text-3xl font-bold text-clay-800 font-display">{personaCount}</div>
          <div className="text-xs text-clay-500 mt-1">个模拟角色</div>
        </div>

        {/* Total Issues */}
        <div className="clay-card p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-accent-amber" />
            <span className="text-xs font-semibold text-clay-500 uppercase tracking-wider">发现问题</span>
          </div>
          <div className="text-3xl font-bold text-clay-800 font-display">{totalIssues}</div>
          <div className="text-xs text-clay-500 mt-1">
            {severityCounts['一级问题'] > 0 && <span className="text-red-500 font-semibold">{severityCounts['一级问题']} 个严重</span>}
            {severityCounts['一级问题'] === 0 && '无严重问题'}
          </div>
        </div>

        {/* Total Suggestions */}
        <div className="clay-card p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={16} className="text-accent-emerald" />
            <span className="text-xs font-semibold text-clay-500 uppercase tracking-wider">优化建议</span>
          </div>
          <div className="text-3xl font-bold text-clay-800 font-display">{totalSuggestions}</div>
          <div className="text-xs text-clay-500 mt-1">条战略建议</div>
        </div>
      </div>

      {/* === Section 2: Heatmap === */}
      <div className="clay-card rounded-3xl overflow-hidden">
        <div className="p-6" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <h3 className="text-lg font-bold text-clay-800 flex items-center gap-2.5 font-display">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
              background: 'linear-gradient(145deg, #F472B6 0%, #EC4899 100%)',
              boxShadow: '0 4px 12px -2px rgba(244, 114, 182, 0.35)'
            }}>
              <Flame className="w-4 h-4 text-white" />
            </div>
            得分热力图
          </h3>
          <p className="text-sm text-clay-500 mt-1.5">颜色越深表示得分越高，浅色区域为体验短板</p>
        </div>

        <div className="p-6 overflow-x-auto">
          <div style={{ minWidth: '760px' }} className="space-y-1">
            {/* Header Row */}
            <div className="flex gap-1 mb-2">
              <div className="w-[130px] shrink-0 flex items-end pb-2 px-2">
                <span className="text-[10px] font-bold text-clay-400 uppercase tracking-wider">角色 / 维度</span>
              </div>
              {dimensions.map(dim => (
                <div key={dim} className="flex-1 flex items-end justify-center pb-2 px-1">
                  <span className="text-[11px] font-semibold text-clay-600 text-center leading-tight">{dim}</span>
                </div>
              ))}
              <div className="w-[70px] shrink-0 flex items-end justify-center pb-2">
                <span className="text-[11px] font-bold text-accent-violet">综合</span>
              </div>
            </div>

            {/* Data Rows */}
            {heatmapRows.map((row) => (
              <div key={row.personaName} className="flex gap-1">
                <div className="w-[130px] shrink-0 h-[44px] flex items-center px-2">
                  <span className="text-xs font-semibold text-clay-700 truncate" title={row.personaName}>
                    {row.personaName}
                  </span>
                </div>
                {dimensions.map(dim => {
                  const data = row.dimScores[dim];
                  const score = data?.score || 0;
                  const color = getScoreColor(score);
                  return (
                    <div
                      key={dim}
                      className="flex-1 h-[44px] flex items-center justify-center rounded-lg transition-all duration-200 cursor-default hover:scale-[1.08] hover:shadow-lg hover:z-10 relative"
                      style={{ background: color.bg, color: color.text }}
                      onMouseEnter={(e) => {
                        setTooltipData({ persona: row.personaName, dimension: dim, score, comment: data?.comment || '' });
                        setTooltipPos({ x: e.clientX, y: e.clientY });
                      }}
                      onMouseMove={(e) => {
                        setTooltipPos({ x: e.clientX, y: e.clientY });
                      }}
                      onMouseLeave={() => setTooltipData(null)}
                    >
                      <span className="text-sm font-bold">{score}</span>
                    </div>
                  );
                })}
                {/* Overall score */}
                <div
                  className="w-[70px] shrink-0 h-[44px] flex items-center justify-center rounded-lg font-bold text-sm"
                  style={{
                    background: getScoreColor(row.overallScore).bg,
                    color: getScoreColor(row.overallScore).text,
                    boxShadow: 'inset 0 0 0 2px rgba(139, 92, 246, 0.2)'
                  }}
                >
                  {row.overallScore}
                </div>
              </div>
            ))}

            {/* Separator */}
            <div className="pt-2" style={{ borderTop: '2px dashed rgba(0,0,0,0.08)' }}></div>

            {/* Average Row */}
            <div className="flex gap-1">
              <div className="w-[130px] shrink-0 h-[44px] flex items-center px-2">
                <span className="text-xs font-bold text-clay-500 uppercase tracking-wider">平均分</span>
              </div>
              {dimensions.map(dim => {
                const avg = dimAverages[dim] || 0;
                const color = getScoreColor(avg);
                return (
                  <div
                    key={`avg-${dim}`}
                    className="flex-1 h-[44px] flex items-center justify-center rounded-lg"
                    style={{
                      background: color.bg,
                      color: color.text,
                      boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.1)'
                    }}
                  >
                    <span className="text-sm font-bold">{avg}</span>
                  </div>
                );
              })}
              <div
                className="w-[70px] shrink-0 h-[44px] flex items-center justify-center rounded-lg font-bold text-sm"
                style={{
                  background: getScoreColor(avgOverallScore).bg,
                  color: getScoreColor(avgOverallScore).text,
                  boxShadow: 'inset 0 0 0 2px rgba(139, 92, 246, 0.3)'
                }}
              >
                {avgOverallScore}
              </div>
            </div>
          </div>

          {/* Color Legend */}
          <div className="mt-6 flex items-center gap-3 justify-center">
            <span className="text-[10px] text-clay-400 font-medium">短板</span>
            <div className="flex gap-0.5 rounded-lg overflow-hidden" style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)' }}>
              {[25, 35, 45, 55, 65, 75, 85, 95].map(s => (
                <div
                  key={s}
                  className="w-8 h-3.5"
                  style={{ background: getScoreColor(s).bg }}
                  title={`${s}分`}
                />
              ))}
            </div>
            <span className="text-[10px] text-clay-400 font-medium">优秀</span>
          </div>
        </div>
      </div>

      {/* === Section 3: Strengths & Weaknesses === */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Strengths */}
        <div className="clay-card rounded-3xl overflow-hidden">
          <div className="p-6" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <h3 className="text-lg font-bold text-clay-800 flex items-center gap-2.5 font-display">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
                background: 'linear-gradient(145deg, #34D399 0%, #10B981 100%)',
                boxShadow: '0 4px 12px -2px rgba(52, 211, 153, 0.35)'
              }}>
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              体验亮点
            </h3>
            <p className="text-xs text-clay-500 mt-1">平均得分最高的维度</p>
          </div>
          <div className="p-6 space-y-4">
            {strengths.map((dim) => (
              <div key={dim.dimension} className="p-4 rounded-2xl" style={{
                background: 'linear-gradient(145deg, #F0FDF4 0%, #DCFCE7 100%)',
                boxShadow: 'inset 0 1px 3px rgba(34, 197, 94, 0.08)'
              }}>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-emerald-800 text-sm">{dim.dimension}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-clay-500">{dim.min}–{dim.max}</span>
                    <span className="px-2 py-0.5 rounded-lg text-xs font-bold text-white" style={{
                      background: getScoreColor(dim.average).bg
                    }}>
                      均 {dim.average}
                    </span>
                  </div>
                </div>
                {dim.bestComment && (
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    <span className="font-semibold">{dim.bestComment.persona}</span>
                    <span className="text-emerald-500"> ({dim.bestComment.score}分)</span>
                    ：&ldquo;{dim.bestComment.comment.length > 100
                      ? dim.bestComment.comment.slice(0, 100) + '...'
                      : dim.bestComment.comment}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Weaknesses */}
        <div className="clay-card rounded-3xl overflow-hidden">
          <div className="p-6" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <h3 className="text-lg font-bold text-clay-800 flex items-center gap-2.5 font-display">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
                background: 'linear-gradient(145deg, #FB7185 0%, #F43F5E 100%)',
                boxShadow: '0 4px 12px -2px rgba(251, 113, 133, 0.35)'
              }}>
                <TrendingDown className="w-4 h-4 text-white" />
              </div>
              体验短板
            </h3>
            <p className="text-xs text-clay-500 mt-1">平均得分最低的维度</p>
          </div>
          <div className="p-6 space-y-4">
            {weaknesses.map((dim) => (
              <div key={dim.dimension} className="p-4 rounded-2xl" style={{
                background: 'linear-gradient(145deg, #FFF1F2 0%, #FFE4E6 100%)',
                boxShadow: 'inset 0 1px 3px rgba(244, 63, 94, 0.08)'
              }}>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-rose-800 text-sm">{dim.dimension}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-clay-500">{dim.min}–{dim.max}</span>
                    <span className="px-2 py-0.5 rounded-lg text-xs font-bold text-white" style={{
                      background: getScoreColor(dim.average).bg
                    }}>
                      均 {dim.average}
                    </span>
                  </div>
                </div>
                {dim.worstComment && (
                  <p className="text-xs text-rose-700 leading-relaxed">
                    <span className="font-semibold">{dim.worstComment.persona}</span>
                    <span className="text-rose-400"> ({dim.worstComment.score}分)</span>
                    ：&ldquo;{dim.worstComment.comment.length > 100
                      ? dim.worstComment.comment.slice(0, 100) + '...'
                      : dim.worstComment.comment}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* === Section 4: Issue Hotspots === */}
      {issueHotspots.length > 0 && (
        <div className="clay-card rounded-3xl overflow-hidden">
          <div className="p-6" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <h3 className="text-lg font-bold text-clay-800 flex items-center gap-2.5 font-display">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
                background: 'linear-gradient(145deg, #F97316 0%, #EA580C 100%)',
                boxShadow: '0 4px 12px -2px rgba(249, 115, 22, 0.35)'
              }}>
                <MapPin className="w-4 h-4 text-white" />
              </div>
              共性问题热点
            </h3>
            <p className="text-sm text-clay-500 mt-1.5">
              以下位置被 <span className="font-semibold text-clay-700">2 个以上角色</span> 同时指出存在问题
            </p>
          </div>
          <div className="p-6 space-y-3">
            {issueHotspots.map((hotspot, idx) => (
              <div key={idx} className="clay-card p-4 rounded-2xl hover:shadow-soft transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <span className="clay-badge px-3 py-1.5 text-xs font-bold text-clay-700">{hotspot.location}</span>
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold" style={{
                    background: 'linear-gradient(145deg, #FEF3C7 0%, #FDE68A 100%)',
                    color: '#92400E'
                  }}>
                    {hotspot.personaCount} 个角色共识
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {hotspot.personaNames.map(name => (
                    <span key={name} className="text-[10px] px-2 py-0.5 rounded-md font-medium" style={{
                      background: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 100%)',
                      color: '#7C3AED'
                    }}>
                      {name}
                    </span>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {hotspot.issues.slice(0, 3).map((issue, i) => (
                    <p key={i} className="text-xs text-clay-600 leading-relaxed pl-3" style={{ borderLeft: '2px solid rgba(0,0,0,0.06)' }}>
                      <span className="font-semibold text-clay-500">[{issue.personaName}]</span>{' '}
                      {issue.description.length > 80 ? issue.description.slice(0, 80) + '...' : issue.description}
                    </p>
                  ))}
                  {hotspot.issues.length > 3 && (
                    <p className="text-[10px] text-clay-400 pl-3">...还有 {hotspot.issues.length - 3} 条相关问题</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === Section 5: Issue Distribution & Details === */}
      <div className="clay-card rounded-3xl overflow-hidden">
        <div className="p-6" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <h3 className="text-lg font-bold text-clay-800 flex items-center gap-2.5 font-display">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
              background: 'linear-gradient(145deg, #FBBF24 0%, #F59E0B 100%)',
              boxShadow: '0 4px 12px -2px rgba(251, 191, 36, 0.35)'
            }}>
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
            问题分布
          </h3>
          <p className="text-sm text-clay-500 mt-1.5">共发现 <span className="font-semibold text-clay-700">{totalIssues}</span> 个问题</p>
        </div>

        {/* Severity Distribution Bar */}
        <div className="px-6 pt-6">
          <div className="flex rounded-xl overflow-hidden h-8" style={{ boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)' }}>
            {totalIssues > 0 && ['一级问题', '二级问题', '三级问题'].map(severity => {
              const count = severityCounts[severity] || 0;
              if (count === 0) return null;
              const pct = (count / totalIssues) * 100;
              const style = severityStyles[severity];
              return (
                <div
                  key={severity}
                  className="flex items-center justify-center text-[10px] font-bold transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    background: style?.barColor || '#94A3B8',
                    color: 'white',
                    minWidth: '40px'
                  }}
                  title={`${severity}: ${count}个 (${Math.round(pct)}%)`}
                >
                  {count}
                </div>
              );
            })}
          </div>
          <div className="flex justify-center gap-6 mt-3">
            {['一级问题', '二级问题', '三级问题'].map(severity => (
              <div key={severity} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: severityStyles[severity]?.barColor || '#94A3B8' }} />
                <span className="text-[10px] text-clay-500">{severity} ({severityCounts[severity] || 0})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Grouped Issues by Severity */}
        <div className="p-6 space-y-3">
          {groupedIssues.map(({ severity, count, issues }) => {
            const isExpanded = expandedSeverities[severity] ?? false;
            const style = severityStyles[severity];
            return (
              <div key={severity} className="rounded-2xl overflow-hidden" style={{
                border: '1px solid rgba(0,0,0,0.04)',
                background: 'linear-gradient(145deg, #FAFBFD 0%, #F5F7FA 100%)'
              }}>
                <button
                  onClick={() => toggleSeverity(severity)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-xl text-xs font-bold" style={{
                      background: style?.bg,
                      color: style?.color
                    }}>
                      {severity}
                    </span>
                    <span className="text-sm font-medium text-clay-600">{count} 个问题</span>
                  </div>
                  {isExpanded
                    ? <ChevronUp size={16} className="text-clay-400" />
                    : <ChevronDown size={16} className="text-clay-400" />}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2">
                    {issues.map((issue, idx) => (
                      <div key={idx} className="clay-card p-4 rounded-xl">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{
                            background: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 100%)',
                            color: '#7C3AED'
                          }}>
                            {issue.personaName}
                          </span>
                          <span className="clay-badge px-2 py-0.5 text-[10px] font-medium text-clay-500">
                            {issue.location}
                          </span>
                        </div>
                        <p className="text-sm text-clay-700 mb-2">{issue.description}</p>
                        <div className="flex items-start gap-2 p-3 rounded-lg" style={{
                          background: 'linear-gradient(145deg, #F0FDF4 0%, #DCFCE7 100%)',
                          boxShadow: 'inset 0 1px 2px rgba(34, 197, 94, 0.06)'
                        }}>
                          <Zap className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-emerald-700">{issue.recommendation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* === Section 6: Common Suggestions === */}
      <div className="clay-card rounded-3xl overflow-hidden">
        <div className="p-6" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <h3 className="text-lg font-bold text-clay-800 flex items-center gap-2.5 font-display">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
              background: 'linear-gradient(145deg, #34D399 0%, #10B981 100%)',
              boxShadow: '0 4px 12px -2px rgba(52, 211, 153, 0.35)'
            }}>
              <Lightbulb className="w-4 h-4 text-white" />
            </div>
            战略优化建议汇总
          </h3>
          <p className="text-sm text-clay-500 mt-1.5">来自 {personaCount} 个角色的 {totalSuggestions} 条优化建议</p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allSuggestions.map((suggestion, idx) => (
              <div key={idx} className="clay-card flex items-start gap-3 p-4 rounded-2xl hover:shadow-soft transition-all">
                <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs text-white" style={{
                  background: 'linear-gradient(145deg, #34D399 0%, #10B981 100%)',
                  boxShadow: '0 2px 8px -2px rgba(52, 211, 153, 0.3)'
                }}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md inline-block mb-1.5" style={{
                    background: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 100%)',
                    color: '#7C3AED'
                  }}>
                    {suggestion.personaName}
                  </span>
                  <p className="text-sm text-clay-700 leading-relaxed">{suggestion.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* === Tooltip (Fixed Position) === */}
      {tooltipData && (
        <div
          className="fixed z-[100] pointer-events-none"
          style={{
            left: `${tooltipPos.x + 16}px`,
            top: `${tooltipPos.y - 16}px`,
            transform: 'translateY(-100%)'
          }}
        >
          <div className="px-4 py-3 rounded-xl max-w-xs" style={{
            background: 'linear-gradient(145deg, #FFFFFF 0%, #FAFBFD 100%)',
            boxShadow: '0 12px 32px -6px rgba(0, 0, 0, 0.15), 0 4px 12px -2px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
            border: '1px solid rgba(255, 255, 255, 0.8)'
          }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{
                background: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 100%)',
                color: '#7C3AED'
              }}>
                {tooltipData.persona}
              </span>
              <span className="text-[10px] font-semibold text-clay-500">{tooltipData.dimension}</span>
            </div>
            <div className="text-2xl font-bold mb-1" style={{
              color: tooltipData.score >= 60 ? '#059669' : '#DC2626'
            }}>
              {tooltipData.score} <span className="text-sm font-medium text-clay-400">分</span>
            </div>
            {tooltipData.comment && (
              <p className="text-[11px] text-clay-600 leading-relaxed line-clamp-3">
                {tooltipData.comment}
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
