import React from 'react';
import { ETSReport, ProcessStep } from '../types';
import { ETSRadarChart } from './RadarChart';
import { AlertTriangle, CheckCircle, Target, User, FileText, Zap, Wand2, ArrowRight, Image as ImageIcon, ListChecks, ArrowDown, HelpCircle, Info, Video as VideoIcon, TrendingUp, Award, Lightbulb, ChevronRight } from 'lucide-react';

interface ReportViewProps {
  report: ETSReport;
  originalImage?: string | null;
  processSteps?: ProcessStep[];
  optimizedImage?: string | null;
  isGeneratingImage?: boolean;
}

const SeverityBadge: React.FC<{ severity: string }> = ({ severity }) => {
  const styles: Record<string, { bg: string; color: string; glow: string }> = {
    '一级问题': { 
      bg: 'linear-gradient(145deg, #FEE2E2 0%, #FECACA 100%)', 
      color: '#DC2626',
      glow: '0 4px 12px -2px rgba(220, 38, 38, 0.25)'
    },
    '二级问题': { 
      bg: 'linear-gradient(145deg, #FFEDD5 0%, #FED7AA 100%)', 
      color: '#EA580C',
      glow: '0 4px 12px -2px rgba(234, 88, 12, 0.25)'
    },
    '三级问题': { 
      bg: 'linear-gradient(145deg, #DBEAFE 0%, #BFDBFE 100%)', 
      color: '#2563EB',
      glow: '0 4px 12px -2px rgba(37, 99, 235, 0.25)'
    },
    '严重': { 
      bg: 'linear-gradient(145deg, #FEE2E2 0%, #FECACA 100%)', 
      color: '#DC2626',
      glow: '0 4px 12px -2px rgba(220, 38, 38, 0.25)'
    },
    'Critical': { 
      bg: 'linear-gradient(145deg, #FEE2E2 0%, #FECACA 100%)', 
      color: '#DC2626',
      glow: '0 4px 12px -2px rgba(220, 38, 38, 0.25)'
    },
    '高': { 
      bg: 'linear-gradient(145deg, #FFEDD5 0%, #FED7AA 100%)', 
      color: '#EA580C',
      glow: '0 4px 12px -2px rgba(234, 88, 12, 0.25)'
    },
    'High': { 
      bg: 'linear-gradient(145deg, #FFEDD5 0%, #FED7AA 100%)', 
      color: '#EA580C',
      glow: '0 4px 12px -2px rgba(234, 88, 12, 0.25)'
    },
    '中': { 
      bg: 'linear-gradient(145deg, #FEF9C3 0%, #FEF08A 100%)', 
      color: '#CA8A04',
      glow: '0 4px 12px -2px rgba(202, 138, 4, 0.25)'
    },
    'Medium': { 
      bg: 'linear-gradient(145deg, #FEF9C3 0%, #FEF08A 100%)', 
      color: '#CA8A04',
      glow: '0 4px 12px -2px rgba(202, 138, 4, 0.25)'
    },
    '低': { 
      bg: 'linear-gradient(145deg, #DBEAFE 0%, #BFDBFE 100%)', 
      color: '#2563EB',
      glow: '0 4px 12px -2px rgba(37, 99, 235, 0.25)'
    },
    'Low': { 
      bg: 'linear-gradient(145deg, #DBEAFE 0%, #BFDBFE 100%)', 
      color: '#2563EB',
      glow: '0 4px 12px -2px rgba(37, 99, 235, 0.25)'
    },
  };

  const style = styles[severity] || { 
    bg: 'linear-gradient(145deg, #F1F5F9 0%, #E2E8F0 100%)', 
    color: '#475569',
    glow: '0 4px 12px -2px rgba(71, 85, 105, 0.15)'
  };

  return (
    <span 
      className="px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center"
      style={{ 
        background: style.bg, 
        color: style.color,
        boxShadow: `${style.glow}, inset 0 1px 0 rgba(255,255,255,0.6)`
      }}
    >
      {severity}
    </span>
  );
};

// Score indicator component
const ScoreIndicator: React.FC<{ score: number }> = ({ score }) => {
  let gradient, glow;
  if (score >= 80) {
    gradient = 'linear-gradient(145deg, #34D399 0%, #10B981 100%)';
    glow = '0 4px 12px -2px rgba(52, 211, 153, 0.4)';
  } else if (score >= 60) {
    gradient = 'linear-gradient(145deg, #60A5FA 0%, #3B82F6 100%)';
    glow = '0 4px 12px -2px rgba(96, 165, 250, 0.4)';
  } else {
    gradient = 'linear-gradient(145deg, #FB7185 0%, #F43F5E 100%)';
    glow = '0 4px 12px -2px rgba(251, 113, 133, 0.4)';
  }

  return (
    <span 
      className="px-2.5 py-1 rounded-lg text-xs font-bold text-white"
      style={{ 
        background: gradient,
        boxShadow: `${glow}, inset 0 1px 0 rgba(255,255,255,0.3)`
      }}
    >
      {score}分
    </span>
  );
};

export const ReportView: React.FC<ReportViewProps> = ({ report, originalImage, processSteps, optimizedImage, isGeneratingImage }) => {
  
  const isVideo = originalImage && originalImage.startsWith('data:video');

  return (
    <div className="space-y-8 pb-8">
      
      {/* Visual Content Section */}
      {processSteps && processSteps.length > 0 ? (
        <div className="clay-card p-6 rounded-3xl">
          <div className="w-full flex items-center justify-start mb-6 pb-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <h3 className="text-lg font-bold text-clay-800 flex items-center gap-2.5 font-display">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
                background: 'linear-gradient(145deg, #A78BFA 0%, #8B5CF6 100%)',
                boxShadow: '0 4px 12px -2px rgba(139, 92, 246, 0.35)'
              }}>
                <ListChecks className="w-4 h-4 text-white" />
              </div>
              测评业务流程
            </h3>
          </div>
          <div className="relative ml-4 space-y-6 pb-4" style={{ borderLeft: '2px solid rgba(139, 92, 246, 0.2)' }}>
            {processSteps.map((step, idx) => (
              <div key={step.id} className="relative pl-8">
                {/* Timeline Dot */}
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full" style={{
                  background: 'linear-gradient(145deg, #A78BFA 0%, #8B5CF6 100%)',
                  boxShadow: '0 2px 8px -2px rgba(139, 92, 246, 0.5), 0 0 0 4px white'
                }}></div>
                
                <div className="clay-card rounded-2xl overflow-hidden">
                  <div className="p-3 flex gap-3 items-center" style={{ 
                    background: 'linear-gradient(145deg, #FAFBFD 0%, #F5F7FA 100%)',
                    borderBottom: '1px solid rgba(0,0,0,0.04)'
                  }}>
                    <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg text-white" style={{
                      background: 'linear-gradient(145deg, #3D4B61 0%, #2A3544 100%)',
                      boxShadow: '0 2px 6px -2px rgba(42, 53, 68, 0.4)'
                    }}>步骤 {idx + 1}</span>
                    <p className="text-sm font-medium text-clay-700">
                      {step.description || "用户浏览此界面"}
                    </p>
                  </div>
                  <div className="p-3" style={{ background: 'linear-gradient(145deg, #F5F7FA 0%, #EAEEF4 100%)' }}>
                    <img 
                      src={step.image} 
                      alt={`Step ${idx + 1}`} 
                      className="w-full h-auto max-h-[280px] object-contain rounded-xl"
                      style={{ boxShadow: '0 4px 16px -4px rgba(0,0,0,0.1)' }}
                    />
                  </div>
                </div>

                {idx < processSteps.length - 1 && (
                  <div className="absolute left-8 bottom-[-20px] flex justify-center w-full opacity-40">
                    <ArrowDown size={18} className="text-accent-violet" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        originalImage && (
          <div className="clay-card p-6 rounded-3xl flex flex-col items-center">
            <div className="w-full flex items-center justify-start mb-5 pb-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <h3 className="text-lg font-bold text-clay-800 flex items-center gap-2.5 font-display">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
                  background: isVideo 
                    ? 'linear-gradient(145deg, #38BDF8 0%, #0EA5E9 100%)'
                    : 'linear-gradient(145deg, #A78BFA 0%, #8B5CF6 100%)',
                  boxShadow: isVideo
                    ? '0 4px 12px -2px rgba(56, 189, 248, 0.35)'
                    : '0 4px 12px -2px rgba(139, 92, 246, 0.35)'
                }}>
                  {isVideo ? <VideoIcon className="w-4 h-4 text-white" /> : <ImageIcon className="w-4 h-4 text-white" />}
                </div>
                {isVideo ? "测评视频" : "测评界面截图"}
              </h3>
            </div>
            <div className="max-w-2xl w-full rounded-2xl overflow-hidden p-3" style={{
              background: 'linear-gradient(145deg, #EAEEF4 0%, #F0F3F9 100%)',
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.06), inset 0 -1px 0 rgba(255,255,255,0.6)'
            }}>
              {isVideo ? (
                <video 
                  src={originalImage} 
                  controls 
                  className="w-full h-auto max-h-[380px] object-contain mx-auto rounded-xl"
                  style={{ boxShadow: '0 8px 24px -6px rgba(0,0,0,0.15)' }}
                >
                  您的浏览器不支持视频播放。
                </video>
              ) : (
                <img 
                  src={originalImage} 
                  alt="Analyzed UI" 
                  className="w-full h-auto max-h-[380px] object-contain mx-auto rounded-xl"
                  style={{ boxShadow: '0 8px 24px -6px rgba(0,0,0,0.15)' }}
                />
              )}
            </div>
          </div>
        )
      )}

      {/* Header Section - Score & Radar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Overall Score */}
        <div className="md:col-span-1">
          <div className="clay-card h-full flex flex-col justify-between relative overflow-hidden rounded-3xl p-6" style={{
            background: 'linear-gradient(145deg, #A78BFA 0%, #8B5CF6 50%, #7C3AED 100%)',
            boxShadow: '0 12px 32px -8px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <Award className="text-white/70" size={16} />
                <h2 className="text-white/80 text-xs font-semibold uppercase tracking-widest">{report.modelType || 'ETS'} 总体评分</h2>
              </div>
              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-6xl font-bold text-white font-display" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>{report.overallScore}</span>
                <span className="text-2xl text-white/60">/ 100</span>
              </div>
              <div className="mt-5 inline-block px-4 py-2 rounded-xl text-sm font-semibold" style={{
                background: 'rgba(255,255,255,0.2)',
                backdropFilter: 'blur(8px)',
                color: 'white',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)'
              }}>
                {report.overallScore >= 80 ? '✨ 优秀' : report.overallScore >= 60 ? '👍 良好' : '⚠️ 需改进'}
              </div>
            </div>
            <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-6 translate-y-6">
              <Target size={160} strokeWidth={1} />
            </div>
          </div>
        </div>

        {/* Radar Chart */}
        <div className="md:col-span-2 clay-card p-6 rounded-3xl">
          <h3 className="text-lg font-bold text-clay-800 mb-5 flex items-center gap-2.5 font-display">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
              background: 'linear-gradient(145deg, #38BDF8 0%, #0EA5E9 100%)',
              boxShadow: '0 4px 12px -2px rgba(56, 189, 248, 0.35)'
            }}>
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            维度分布
          </h3>
          <div className="flex flex-col md:flex-row h-full gap-5">
            <div className="flex-1 h-64 md:h-auto">
              <ETSRadarChart data={report.dimensionScores} />
            </div>
            <div className="md:w-48 overflow-y-auto max-h-64 pr-2 pl-5" style={{ borderLeft: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="space-y-3">
                {report.dimensionScores.map((d) => (
                  <div key={d.dimension} className="flex justify-between items-center text-sm">
                    <span className="text-clay-500 truncate mr-3" title={d.dimension}>{d.dimension}</span>
                    <ScoreIndicator score={d.score} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="clay-card p-6 rounded-3xl">
          <h3 className="text-lg font-bold text-clay-800 mb-4 flex items-center gap-2.5 font-display">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
              background: 'linear-gradient(145deg, #60A5FA 0%, #3B82F6 100%)',
              boxShadow: '0 4px 12px -2px rgba(96, 165, 250, 0.35)'
            }}>
              <FileText className="w-4 h-4 text-white" />
            </div>
            执行摘要
          </h3>
          <p className="text-clay-600 leading-relaxed text-sm md:text-base">
            {report.executiveSummary}
          </p>
        </div>
        <div className="clay-card p-6 rounded-3xl">
          <h3 className="text-lg font-bold text-clay-800 mb-4 flex items-center gap-2.5 font-display">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
              background: 'linear-gradient(145deg, #C084FC 0%, #A855F7 100%)',
              boxShadow: '0 4px 12px -2px rgba(192, 132, 252, 0.35)'
            }}>
              <User className="w-4 h-4 text-white" />
            </div>
            角色视角分析
          </h3>
          <div className="rounded-2xl p-5" style={{
            background: 'linear-gradient(145deg, #FAF5FF 0%, #F3E8FF 100%)',
            boxShadow: 'inset 0 2px 6px rgba(168, 85, 247, 0.08), inset 0 -1px 0 rgba(255,255,255,0.6)'
          }}>
            <p className="text-clay-700 italic leading-relaxed text-sm md:text-base">
              "{report.personaPerspective}"
            </p>
          </div>
        </div>
      </div>

      {/* Detailed Dimension Analysis */}
      <div className="clay-card rounded-3xl overflow-hidden">
        <div className="p-6" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <h3 className="text-lg font-bold text-clay-800 flex items-center gap-2.5 font-display">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
              background: 'linear-gradient(145deg, #2DD4BF 0%, #14B8A6 100%)',
              boxShadow: '0 4px 12px -2px rgba(45, 212, 191, 0.35)'
            }}>
              <ListChecks className="w-4 h-4 text-white" />
            </div>
            维度详细解读
          </h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {report.dimensionScores.map((dim, idx) => (
            <div key={idx} className="p-5 rounded-2xl flex flex-col gap-3" style={{
              background: 'linear-gradient(145deg, #FAFBFD 0%, #F5F7FA 100%)',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.04), inset 0 -1px 0 rgba(255,255,255,0.8)'
            }}>
              <div className="flex justify-between items-center">
                <span className="font-bold text-clay-700">{dim.dimension}</span>
                <ScoreIndicator score={dim.score} />
              </div>
              <p className="text-sm text-clay-600 leading-relaxed">
                {dim.comment || "暂无详细评价"}
              </p>
              
              {dim.dimension.includes("系统性能") && (
                <div className="flex items-start gap-2 mt-2 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                  <Info className="w-3.5 h-3.5 text-clay-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-clay-400 italic">
                    说明：{isVideo ? "基于视频录屏分析交互性能与反馈速度。" : "根据截图无法测算真实的系统响应性能。此评分仅针对视觉基础元素进行审查。"}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Visual Optimization Comparison */}
      {!isVideo && (optimizedImage || isGeneratingImage) && (
        <div className="clay-card rounded-3xl overflow-hidden">
          <div className="p-6" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <h3 className="text-lg font-bold text-clay-800 flex items-center gap-2.5 font-display">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
                background: 'linear-gradient(145deg, #F472B6 0%, #EC4899 100%)',
                boxShadow: '0 4px 12px -2px rgba(244, 114, 182, 0.35)'
              }}>
                <Wand2 className="w-4 h-4 text-white" />
              </div>
              视觉优化方案
            </h3>
            <p className="text-sm text-clay-500 mt-1.5">基于 AI 视觉模型生成的优化建议效果图</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              
              {/* Original */}
              <div className="space-y-4">
                <span className="text-xs font-bold text-clay-500 uppercase tracking-wider block text-center">当前版本</span>
                <div className="relative rounded-2xl overflow-hidden aspect-square flex items-center justify-center p-4" style={{
                  background: 'linear-gradient(145deg, #EAEEF4 0%, #F0F3F9 100%)',
                  boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.06)'
                }}>
                  {(processSteps && processSteps.length > 0) ? (
                    <img 
                      src={processSteps[0].image} 
                      alt="Original Design" 
                      className="max-w-full max-h-full object-contain rounded-xl"
                      style={{ boxShadow: '0 8px 24px -6px rgba(0,0,0,0.12)' }}
                    />
                  ) : originalImage && (
                    <img 
                      src={originalImage} 
                      alt="Original Design" 
                      className="max-w-full max-h-full object-contain rounded-xl"
                      style={{ boxShadow: '0 8px 24px -6px rgba(0,0,0,0.12)' }}
                    />
                  )}
                </div>
              </div>

              {/* Arrow */}
              <div className="hidden md:flex justify-center">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{
                  background: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 100%)',
                  boxShadow: '0 4px 12px -4px rgba(139, 92, 246, 0.2)'
                }}>
                  <ChevronRight size={24} className="text-accent-violet" />
                </div>
              </div>

              {/* Optimized */}
              <div className="space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider block text-center" style={{ color: '#8B5CF6' }}>AI 优化建议</span>
                <div className="relative rounded-2xl overflow-hidden aspect-square flex items-center justify-center p-4" style={{
                  background: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 100%)',
                  boxShadow: 'inset 0 2px 6px rgba(139, 92, 246, 0.08), 0 4px 16px -4px rgba(139, 92, 246, 0.15)'
                }}>
                  {isGeneratingImage ? (
                    <div className="flex flex-col items-center justify-center gap-4 text-accent-violet">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
                        background: 'linear-gradient(145deg, #A78BFA 0%, #8B5CF6 100%)',
                        boxShadow: '0 4px 12px -2px rgba(139, 92, 246, 0.4)'
                      }}>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      </div>
                      <span className="text-sm font-medium animate-pulse">正在绘制优化方案...</span>
                    </div>
                  ) : optimizedImage ? (
                    <img 
                      src={optimizedImage} 
                      alt="Optimized Design" 
                      className="max-w-full max-h-full object-contain rounded-xl transition-transform duration-500 hover:scale-105"
                      style={{ boxShadow: '0 8px 24px -6px rgba(139, 92, 246, 0.2)' }}
                    />
                  ) : (
                    <div className="text-clay-400 text-sm">无法生成优化图</div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Issues List */}
      <div className="clay-card rounded-3xl overflow-hidden">
        <div className="p-6 flex justify-between items-center" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <h3 className="text-lg font-bold text-clay-800 flex items-center gap-2.5 font-display">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
              background: 'linear-gradient(145deg, #FBBF24 0%, #F59E0B 100%)',
              boxShadow: '0 4px 12px -2px rgba(251, 191, 36, 0.35)'
            }}>
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
            发现的问题
          </h3>
          <span className="clay-badge px-3 py-1.5 text-xs font-bold text-clay-600">{report.issues.length} 个问题</span>
        </div>
        
        <div className="p-6 pb-0">
          {/* Legend Section */}
          <div className="p-5 rounded-2xl" style={{
            background: 'linear-gradient(145deg, #FAFBFD 0%, #F5F7FA 100%)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <div className="flex items-center gap-2 mb-4">
              <HelpCircle size={14} className="text-clay-400" />
              <span className="text-xs font-bold text-clay-500 uppercase tracking-wider">严重等级判定标准</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Level 1 */}
              <div className="clay-card p-4 rounded-xl relative overflow-hidden group hover:shadow-soft transition-all">
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{
                  background: 'linear-gradient(180deg, #EF4444 0%, #DC2626 100%)'
                }}></div>
                <div className="pl-3">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-bold text-clay-800">一级问题</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide" style={{
                      background: 'linear-gradient(145deg, #FEE2E2 0%, #FECACA 100%)',
                      color: '#DC2626'
                    }}>Critical</span>
                  </div>
                  <div className="text-xs font-semibold text-clay-700 mb-1">常用功能 + 影响大</div>
                  <p className="text-[10px] text-clay-500 leading-relaxed">
                    导致操作失败、损害用户利益
                  </p>
                </div>
              </div>

              {/* Level 2 */}
              <div className="clay-card p-4 rounded-xl relative overflow-hidden group hover:shadow-soft transition-all">
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{
                  background: 'linear-gradient(180deg, #F97316 0%, #EA580C 100%)'
                }}></div>
                <div className="pl-3">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-bold text-clay-800">二级问题</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide" style={{
                      background: 'linear-gradient(145deg, #FFEDD5 0%, #FED7AA 100%)',
                      color: '#EA580C'
                    }}>Major</span>
                  </div>
                  <div className="text-xs font-semibold text-clay-700 mb-1">常用(中/小) / 不常用(大)</div>
                  <p className="text-[10px] text-clay-500 leading-relaxed">
                    操作延迟、受挫但不导致失败
                  </p>
                </div>
              </div>

              {/* Level 3 */}
              <div className="clay-card p-4 rounded-xl relative overflow-hidden group hover:shadow-soft transition-all">
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{
                  background: 'linear-gradient(180deg, #3B82F6 0%, #2563EB 100%)'
                }}></div>
                <div className="pl-3">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-bold text-clay-800">三级问题</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide" style={{
                      background: 'linear-gradient(145deg, #DBEAFE 0%, #BFDBFE 100%)',
                      color: '#2563EB'
                    }}>Minor</span>
                  </div>
                  <div className="text-xs font-semibold text-clay-700 mb-1">不常用功能 + 影响中/小</div>
                  <p className="text-[10px] text-clay-500 leading-relaxed">
                    仅影响使用感受，无明显阻碍
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto p-6">
          <div className="space-y-3">
            {report.issues.map((issue, index) => (
              <div key={index} className="clay-card p-5 rounded-2xl hover:shadow-soft transition-all">
                <div className="flex flex-wrap gap-3 items-start mb-3">
                  <SeverityBadge severity={issue.severity} />
                  <span className="clay-badge px-3 py-1.5 text-xs font-semibold text-clay-600">{issue.location}</span>
                </div>
                <p className="text-clay-700 text-sm mb-4">{issue.description}</p>
                <div className="flex items-start gap-3 p-4 rounded-xl" style={{
                  background: 'linear-gradient(145deg, #F0FDF4 0%, #DCFCE7 100%)',
                  boxShadow: 'inset 0 1px 3px rgba(34, 197, 94, 0.08)'
                }}>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                    background: 'linear-gradient(145deg, #34D399 0%, #10B981 100%)',
                    boxShadow: '0 2px 8px -2px rgba(52, 211, 153, 0.4)'
                  }}>
                    <Zap className="w-3 h-3 text-white" />
                  </div>
                  <p className="text-sm text-emerald-700">{issue.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Strategic Recommendations */}
      <div className="clay-card p-6 rounded-3xl">
        <h3 className="text-lg font-bold text-clay-800 mb-6 flex items-center gap-2.5 font-display">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
            background: 'linear-gradient(145deg, #34D399 0%, #10B981 100%)',
            boxShadow: '0 4px 12px -2px rgba(52, 211, 153, 0.35)'
          }}>
            <Lightbulb className="w-4 h-4 text-white" />
          </div>
          战略优化建议
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {report.optimizationSuggestions.map((suggestion, idx) => (
            <div key={idx} className="clay-card flex items-start gap-4 p-5 rounded-2xl hover:shadow-soft transition-all group">
              <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm text-white" style={{
                background: 'linear-gradient(145deg, #34D399 0%, #10B981 100%)',
                boxShadow: '0 4px 12px -2px rgba(52, 211, 153, 0.3)'
              }}>
                {idx + 1}
              </div>
              <p className="text-clay-700 text-sm leading-relaxed">{suggestion}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};