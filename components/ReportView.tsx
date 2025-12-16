import React from 'react';
import { UESReport, ProcessStep } from '../types';
import { UESRadarChart } from './RadarChart';
import { AlertTriangle, CheckCircle, Target, User, FileText, Zap, Wand2, ArrowRight, Image as ImageIcon, ListChecks, ArrowDown, HelpCircle, Info, Video as VideoIcon } from 'lucide-react';

interface ReportViewProps {
  report: UESReport;
  originalImage?: string | null;
  processSteps?: ProcessStep[]; // Added for flow support
  optimizedImage?: string | null;
  isGeneratingImage?: boolean;
}

const SeverityBadge: React.FC<{ severity: string }> = ({ severity }) => {
  const colors: Record<string, string> = {
    // New Levels
    '一级问题': 'bg-red-100 text-red-800 border-red-200',
    '二级问题': 'bg-orange-100 text-orange-800 border-orange-200',
    '三级问题': 'bg-blue-100 text-blue-800 border-blue-200',
    
    // Legacy Fallbacks
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
    <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${colors[severity] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
      {severity}
    </span>
  );
};

export const ReportView: React.FC<ReportViewProps> = ({ report, originalImage, processSteps, optimizedImage, isGeneratingImage }) => {
  
  // Determine if input is a video based on data URL prefix
  const isVideo = originalImage && originalImage.startsWith('data:video');

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      
      {/* Visual Content Section: Either Single Image/Video or Business Flow */}
      
      {/* Case 1: Business Flow */}
      {processSteps && processSteps.length > 0 ? (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
             <div className="w-full flex items-center justify-start mb-6 border-b border-slate-100 pb-2">
                <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <ListChecks className="w-5 h-5 text-indigo-500" />
                    测评业务流程 (User Flow)
                </h3>
            </div>
            <div className="relative border-l-2 border-indigo-100 ml-4 space-y-8 pb-4">
                {processSteps.map((step, idx) => (
                    <div key={step.id} className="relative pl-8">
                         {/* Timeline Dot */}
                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-indigo-500 border-4 border-white shadow-sm ring-1 ring-indigo-100"></div>
                        
                        <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                             {/* Header / Action Description */}
                             <div className="bg-white border-b border-slate-100 p-3 flex gap-3 items-center">
                                <span className="bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded">步骤 {idx + 1}</span>
                                <p className="text-sm font-medium text-slate-700">
                                    {step.description || "用户浏览此界面"}
                                </p>
                             </div>
                             {/* Image */}
                             <div className="p-2">
                                <img 
                                    src={step.image} 
                                    alt={`Step ${idx + 1}`} 
                                    className="w-full h-auto max-h-[300px] object-contain rounded-lg"
                                />
                             </div>
                        </div>

                        {/* Visual Connector for next step */}
                        {idx < processSteps.length - 1 && (
                            <div className="absolute left-8 bottom-[-24px] flex justify-center w-full opacity-30">
                                <ArrowDown size={20} className="text-indigo-300" />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
      ) : (
        /* Case 2: Single Image or Video */
        originalImage && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center">
                <div className="w-full flex items-center justify-start mb-4 border-b border-slate-100 pb-2">
                    <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                        {isVideo ? <VideoIcon className="w-5 h-5 text-indigo-500" /> : <ImageIcon className="w-5 h-5 text-indigo-500" />}
                        {isVideo ? "测评视频" : "测评界面截图"}
                    </h3>
                </div>
                <div className="max-w-2xl w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-2">
                    {isVideo ? (
                        <video 
                            src={originalImage} 
                            controls 
                            className="w-full h-auto max-h-[400px] object-contain mx-auto rounded-lg shadow-sm"
                        >
                            您的浏览器不支持视频播放。
                        </video>
                    ) : (
                        <img 
                        src={originalImage} 
                        alt="Analyzed UI" 
                        className="w-full h-auto max-h-[400px] object-contain mx-auto rounded-lg shadow-sm"
                        />
                    )}
                </div>
            </div>
        )
      )}

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
            维度分布
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

       {/* Detailed Dimension Analysis (New Section) */}
       <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-teal-500" />
            维度详细解读
          </h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {report.dimensionScores.map((dim, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-700">{dim.dimension}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  dim.score >= 80 ? 'bg-emerald-100 text-emerald-700' : 
                  dim.score >= 60 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                }`}>
                  {dim.score}分
                </span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                {dim.comment || "暂无详细评价"}
              </p>
              
              {/* Context Limitation Disclaimer for System Performance */}
              {dim.dimension.includes("系统性能") && (
                <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-slate-200/60">
                   <Info className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                   <p className="text-xs text-slate-400 italic">
                     说明：{isVideo ? "基于视频录屏分析交互性能与反馈速度。" : "根据截图无法测算真实的系统响应性能。此评分仅针对“页面布局稳定性、无明显的文字溢出或元素错乱”等视觉基础元素进行审查。"}
                   </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Visual Optimization Comparison - HIDDEN FOR VIDEO */}
      {!isVideo && (optimizedImage || isGeneratingImage) && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-indigo-500" />
              视觉优化方案 (AI 自动生成)
            </h3>
            <p className="text-sm text-slate-500 mt-1">基于 AI 视觉模型生成的优化建议效果图。</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              
              {/* Original */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block text-center">当前版本 (Before)</span>
                <div className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square flex items-center justify-center">
                  {/* If flow, show first step, else show original image */}
                  {(processSteps && processSteps.length > 0) ? (
                    <img 
                      src={processSteps[0].image} 
                      alt="Original Design" 
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : originalImage && (
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
        
        <div className="p-6 pb-0">
          {/* Legend Section */}
          <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-200/60">
            <div className="flex items-center gap-2 mb-4">
              <HelpCircle size={15} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">严重等级判定标准</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Level 1 */}
              <div className="relative bg-white p-4 rounded-lg border border-slate-100 shadow-sm overflow-hidden group hover:border-red-100 transition-colors">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l-lg"></div>
                <div className="pl-2">
                    <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-bold text-slate-800">一级问题</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-50 text-red-600 rounded uppercase tracking-wide">Critical</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-700 mb-1">常用功能 + 影响大</div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                        导致操作失败、损害用户利益 <br/> (有效性问题)
                    </p>
                </div>
              </div>

              {/* Level 2 */}
              <div className="relative bg-white p-4 rounded-lg border border-slate-100 shadow-sm overflow-hidden group hover:border-orange-100 transition-colors">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500 rounded-l-lg"></div>
                <div className="pl-2">
                    <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-bold text-slate-800">二级问题</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded uppercase tracking-wide">Major</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-700 mb-1">常用(中/小) / 不常用(大)</div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                        操作延迟、受挫但不导致失败 <br/> (效率问题)
                    </p>
                </div>
              </div>

              {/* Level 3 */}
              <div className="relative bg-white p-4 rounded-lg border border-slate-100 shadow-sm overflow-hidden group hover:border-blue-100 transition-colors">
                 <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-l-lg"></div>
                 <div className="pl-2">
                    <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-bold text-slate-800">三级问题</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded uppercase tracking-wide">Minor</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-700 mb-1">不常用功能 + 影响中/小</div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                        仅影响使用感受，无明显阻碍 <br/> (满意度问题)
                    </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                <th className="p-6 font-medium w-32">严重程度</th>
                <th className="p-6 font-medium w-48">位置</th>
                <th className="p-6 font-medium">问题描述</th>
                <th className="p-6 font-medium w-1/3">优化建议</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {report.issues.map((issue, index) => (
                <tr key={index} className="hover:bg-slate-50 transition-colors">
                  <td className="p-6">
                    <SeverityBadge severity={issue.severity} />
                  </td>
                  <td className="p-6 text-slate-700 font-medium">{issue.location}</td>
                  <td className="p-6 text-slate-600">{issue.description}</td>
                  <td className="p-6 text-slate-600 italic">
                    <div className="flex items-start gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
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