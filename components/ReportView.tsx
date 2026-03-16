import React from 'react';
import { FrameworkReport, EvaluationFramework, ProcessStep } from '../types';
import { FrameworkChart } from './charts/FrameworkChart';
import { FrameworkSections } from './report/FrameworkSections';

interface ReportViewProps {
  report: FrameworkReport;
  framework: EvaluationFramework;
  originalImage?: string | null;
  processSteps?: ProcessStep[];
  optimizedImage?: string | null;
  isGeneratingImage?: boolean;
}

const getSeverityClassName = (severity: string) => {
  if (severity.includes('一级')) return 'bg-red-100 text-red-700';
  if (severity.includes('二级')) return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
};

export const ReportView: React.FC<ReportViewProps> = ({
  report,
  framework,
  originalImage,
  processSteps,
  optimizedImage,
  isGeneratingImage
}) => {
  const isVideo = originalImage?.startsWith('data:video');

  return (
    <div className="space-y-6">
      {(originalImage || processSteps?.length) && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">评测素材</h3>
          {processSteps?.length ? (
            <div className="space-y-3">
              {processSteps.map((step, index) => (
                <div key={step.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500 mb-2">步骤 {index + 1}：{step.description || '无描述'}</p>
                  <img src={step.image} alt={`步骤${index + 1}`} className="max-h-56 rounded-md object-contain" />
                </div>
              ))}
            </div>
          ) : isVideo ? (
            <video src={originalImage || undefined} controls className="max-h-80 rounded-lg" />
          ) : (
            <img src={originalImage || undefined} alt="评测素材" className="max-h-80 rounded-lg" />
          )}
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="text-xs text-violet-700 font-semibold">{framework.name} 综合评分</p>
          <p className="text-4xl font-bold text-violet-900 mt-2">{report.overallScore}</p>
          <p className="text-xs text-violet-600 mt-1">置信度：{report.confidence ?? 0}%</p>
        </div>

        <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">维度可视化</h3>
          <FrameworkChart framework={framework} data={report.dimensionScores} />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">执行摘要</h3>
          <p className="text-sm text-slate-600 mt-2 leading-6">{report.executiveSummary}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">角色视角</h3>
          <p className="text-sm text-slate-600 mt-2 leading-6">{report.personaPerspective}</p>
        </div>
      </section>

      {report.scenarioSummary && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">场景相关结论</h3>
          <p className="text-sm text-slate-600 mt-2 leading-6">{report.scenarioSummary}</p>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800">维度详解</h3>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {report.dimensionScores.map((dimension) => (
            <div key={dimension.dimension} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">{dimension.dimension}</span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {dimension.score}
                </span>
              </div>
              <p className="text-sm text-slate-600 mt-2">{dimension.comment}</p>
            </div>
          ))}
        </div>
      </section>

      {!!report.dynamicSections?.length && <FrameworkSections sections={report.dynamicSections} />}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800">问题清单</h3>
        <div className="mt-3 space-y-2">
          {report.issues.map((issue, index) => (
            <div key={`${issue.location}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getSeverityClassName(issue.severity)}`}>
                  {issue.severity}
                </span>
                <span className="text-xs text-slate-500">{issue.location}</span>
              </div>
              <p className="text-sm text-slate-700 mt-2">{issue.description}</p>
              <p className="text-sm text-emerald-700 mt-1">建议：{issue.recommendation}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800">策略建议</h3>
        <ul className="mt-3 list-disc pl-5 space-y-1 text-sm text-slate-700">
          {report.optimizationSuggestions.map((suggestion, index) => (
            <li key={`${suggestion}-${index}`}>{suggestion}</li>
          ))}
        </ul>
      </section>

      {!!report.evidenceNotes?.length && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-800">证据与限制说明</h3>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-amber-700">
            {report.evidenceNotes.map((note, index) => (
              <li key={`${note}-${index}`}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      {!isVideo && (optimizedImage || isGeneratingImage) && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">AI 优化效果图</h3>
          {isGeneratingImage ? (
            <p className="text-sm text-slate-500">正在生成优化效果图...</p>
          ) : optimizedImage ? (
            <img src={optimizedImage} alt="AI优化效果图" className="max-h-96 rounded-lg" />
          ) : (
            <p className="text-sm text-slate-500">暂无优化图。</p>
          )}
        </section>
      )}
    </div>
  );
};