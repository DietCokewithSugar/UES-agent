
import React from 'react';
import { UESReport } from '../types';
import { UESRadarChart } from './RadarChart';
import { AlertTriangle, CheckCircle, Target, User, FileText, Zap, Wand2, ArrowRight } from 'lucide-react';

interface ReportViewProps {
  report: UESReport;
  originalImage?: string | null;
  optimizedImage?: string | null;
  isGeneratingImage?: boolean;
}

const SeverityBadge: React.FC<{ severity: string }> = ({ severity }) => {
  const colors: Record<string, string> = {
    '严重': 'bg-red-100 text-red-800 border-red-200',
    'Critical': 'bg-red-100 text-red-800 border-red-200',
    '高': 'bg-orange-100 text-orange-800 border-orange-200',
    'High': 'bg-orange-100 text-orange-800 border-orange-200',
    '中': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'Medium': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    '低': 'bg-blue-100 text-blue-800 border-blue-200',
    'Low': 'bg-blue-100 text-blue-800 border-blue-200',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${colors[severity] || colors['低']}`}>
      {severity}
    </span>
  );
};

export const ReportView: React.FC<ReportViewProps> = ({ report, originalImage, optimizedImage, isGeneratingImage }) => {
  return (
    <div className="space-y-8 animate-fade-in pb-12">
      
      {/* Header Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Overall Score */}
        <div className="md:col-span-1">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 text-white p-6 rounded-2xl shadow-lg h-full flex flex-col justify-between relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-indigo-100 text-sm font-medium uppercase tracking-widest mb-1">{report.modelType || 'UES'} 总体评分</h2>
              <div className="flex items-baseline gap-2">
                <span className="text-6xl font-bold">{report.overallScore}</span>
                <span className="text-xl text-indigo-300">/ 100</span>
              </div>
              <div className="mt-4 inline-block px-3 py-1 bg-white/20 backdrop-blur-sm rounded-lg text-sm">
                {report.overallScore >= 80 ? '优秀 (Excellent)' : report.overallScore >= 60 ? '良好 (Average)' : '需改进 (Improve)'}
              </div>
            </div>
            <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4">
              <Target size={140} />
            </div>
          </div>
        </div>

        {/* Radar Chart */}
        <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-500" />
            维度分析
          </h3>
          <div className="flex flex-col md:flex-row h-full gap-4">
            <div className="flex-1 h-64 md:h-auto">
               <UESRadarChart data={report.dimensionScores} />
            </div>
            <div className="md:w-48 overflow-y-auto max-h-64 pr-2 border-l border-slate-100 pl-4">
              <div className="space-y-3">
                {report.dimensionScores.map((d) => (
                  <div key={d.dimension} className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 truncate mr-2" title={d.dimension}>{d.dimension}</span>
                    <span className={`font-bold ${d.score > 80 ? 'text-emerald-600' : 'text-slate-700'}`}>{d.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            执行摘要
          </h3>
          <p className="text-slate-600 leading-relaxed text-sm md:text-base">
            {report.executiveSummary}
          </p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-purple-500" />
            角色视角分析
          </h3>
          <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
             <p className="text-slate-700 italic leading-relaxed text-sm md:text-base">
              "{report.personaPerspective}"
            </p>
          </div>
        </div>
      </div>

      {/* Visual Optimization Comparison */}
      {(optimizedImage || isGeneratingImage) && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-indigo-500" />
              视觉优化方案 (AI 自动生成)
            </h3>
            <p className="text-sm text-slate-500 mt-1">基于 Google Nano Banana 2 (Gemini 3 Pro Image) 模型生成的优化建议效果图。</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              
              {/* Original */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block text-center">当前版本 (Before)</span>
                <div className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square flex items-center justify-center">
                  {originalImage && (
                    <img 
                      src={originalImage} 
                      alt="Original Design" 
                      className="max-w-full max-h-full object-contain"
                    />
                  )}
                </div>
              </div>

              {/* Arrow on Desktop */}
              <div className="hidden md:flex justify-center text-slate-300">
                <ArrowRight size={32} />
              </div>

              {/* Optimized */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider block text-center">AI 优化建议 (After)</span>
                <div className="relative group rounded-xl overflow-hidden border-2 border-indigo-100 bg-indigo-50/30 aspect-square flex items-center justify-center">
                  {isGeneratingImage ? (
                    <div className="flex flex-col items-center justify-center gap-3 text-indigo-500">
                      <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                      <span className="text-sm font-medium animate-pulse">正在绘制优化方案...</span>
                    </div>
                  ) : optimizedImage ? (
                    <img 
                      src={optimizedImage} 
                      alt="Optimized Design" 
                      className="max-w-full max-h-full object-contain transition-transform duration-700 hover:scale-105"
                    />
                  ) : (
                    <div className="text-slate-400 text-sm">无法生成优化图</div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Issues List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            发现的问题
          </h3>
          <span className="text-xs font-medium text-slate-400">{report.issues.length} 个问题</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <th className="p-4 font-medium w-24">严重程度</th>
                <th className="p-4 font-medium w-48">位置</th>
                <th className="p-4 font-medium">问题描述</th>
                <th className="p-4 font-medium w-1/3">优化建议</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {report.issues.map((issue, index) => (
                <tr key={index} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <SeverityBadge severity={issue.severity} />
                  </td>
                  <td className="p-4 text-slate-700 font-medium">{issue.location}</td>
                  <td className="p-4 text-slate-600">{issue.description}</td>
                  <td className="p-4 text-slate-600 italic bg-slate-50/50">
                    <div className="flex items-start gap-2">
                      <Zap className="w-3 h-3 text-indigo-500 mt-1 shrink-0" />
                      {issue.recommendation}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Strategic Recommendations */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-800 mb-6 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-500" />
          战略优化建议
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {report.optimizationSuggestions.map((suggestion, idx) => (
            <div key={idx} className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:shadow-md transition-all">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">
                {idx + 1}
              </div>
              <p className="text-slate-700 text-sm">{suggestion}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
