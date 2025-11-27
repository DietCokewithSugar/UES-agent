import React, { useState, useRef, useEffect } from 'react';
import { Upload, Sparkles, Settings, ChevronRight, Check, Loader2, Plus, X, Layers, Square, CheckSquare, Users, Download, Archive, Package } from 'lucide-react';
import { toPng } from 'html-to-image';
import JSZip from 'jszip';
import FileSaver from 'file-saver';
import { Persona, UESReport, UserRole, EvaluationModel } from './types';
import { analyzeDesign, generateOptimizedDesign } from './services/geminiService';
import { ReportView } from './components/ReportView';

// --- Constants ---
const DEFAULT_PERSONAS: Persona[] = [
  {
    id: '1',
    name: '银发新手用户',
    role: UserRole.USER,
    description: '模拟科技素养较低且可能存在视力障碍的用户。',
    attributes: {
      age: '65岁以上',
      techSavviness: '低',
      domainKnowledge: '新手',
      goals: '无错误地完成基本任务',
      environment: '安静的家庭环境',
      frustrationTolerance: '低',
      deviceHabits: '使用大字体，操作缓慢'
    }
  },
  {
    id: '2',
    name: '极客效率用户',
    role: UserRole.USER,
    description: '追求极致效率，熟知快捷键的专家级用户。',
    attributes: {
      age: '25-35岁',
      techSavviness: '高',
      domainKnowledge: '专家',
      goals: '最快速度完成任务',
      environment: '繁忙的办公室',
      frustrationTolerance: '中',
      deviceHabits: '重度键盘使用者，多屏操作'
    }
  },
  {
    id: '3',
    name: 'UX 专家审计',
    role: UserRole.EXPERT,
    description: '基于启发式原则和设计系统一致性进行专业评估。',
    attributes: {
      age: '30-40岁',
      techSavviness: '高',
      domainKnowledge: '专家',
      goals: '确保设计系统一致性和规范性',
      environment: '设计工作室',
      frustrationTolerance: '高',
      deviceHabits: '像素级审查'
    }
  }
];

const EMPTY_PERSONA: Omit<Persona, 'id'> = {
  name: '',
  role: UserRole.USER,
  description: '',
  attributes: {
    age: '',
    techSavviness: '中',
    domainKnowledge: '新手',
    goals: '',
    environment: '普通室内环境',
    frustrationTolerance: '中',
    deviceHabits: '手机/电脑混合使用'
  }
};

// --- Main App Component ---
export default function App() {
  const [personas, setPersonas] = useState<Persona[]>(DEFAULT_PERSONAS);
  
  // Multi-select state
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([DEFAULT_PERSONAS[0].id]);
  
  // Result Viewer State (Which persona tab is active)
  const [viewingPersonaId, setViewingPersonaId] = useState<string>(DEFAULT_PERSONAS[0].id);

  const [evaluationModel, setEvaluationModel] = useState<EvaluationModel>(EvaluationModel.UES);
  const [image, setImage] = useState<string | null>(null);
  
  // Analysis State (Map by Persona ID)
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reports, setReports] = useState<Record<string, UESReport>>({});
  const [error, setError] = useState<string | null>(null);
  
  // Image Generation State (Map by Persona ID)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [optimizedImages, setOptimizedImages] = useState<Record<string, string>>({});
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPersonaData, setNewPersonaData] = useState<Omit<Persona, 'id'>>(EMPTY_PERSONA);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to get actual persona objects from selected IDs
  const getSelectedPersonas = () => personas.filter(p => selectedPersonaIds.includes(p.id));

  // Reset report if image changes
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setReports({}); 
        setOptimizedImages({});
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const togglePersonaSelection = (id: string) => {
    setSelectedPersonaIds(prev => {
      if (prev.includes(id)) {
        // Prevent deselecting the last one if you want to enforce at least one
        if (prev.length === 1) return prev; 
        return prev.filter(pId => pId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleAnalyze = async () => {
    if (!image) return;
    
    // Check for API Key
    try {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await window.aistudio.openSelectKey();
        }
      }
    } catch (keyError) {
      console.warn("API Key selection check failed:", keyError);
    }

    const targets = getSelectedPersonas();
    if (targets.length === 0) return;

    setIsAnalyzing(true);
    setError(null);
    setReports({});
    setOptimizedImages({});
    
    // Reset viewing persona to the first selected one
    setViewingPersonaId(targets[0].id);

    try {
      // 1. Parallel Text Analysis
      const analysisPromises = targets.map(async (p) => {
        try {
          const result = await analyzeDesign(image, p, evaluationModel);
          return { id: p.id, report: result };
        } catch (e) {
          console.error(`Analysis failed for ${p.name}`, e);
          return null;
        }
      });

      const results = await Promise.all(analysisPromises);
      
      const newReports: Record<string, UESReport> = {};
      results.forEach(res => {
        if (res) newReports[res.id] = res.report;
      });

      if (Object.keys(newReports).length === 0) {
        throw new Error("所有角色分析均失败，请重试。");
      }

      setReports(newReports);
      setIsAnalyzing(false); 

      // 2. Parallel Image Generation
      setIsGeneratingImage(true);
      
      const imagePromises = targets.map(async (p) => {
        const report = newReports[p.id];
        if (!report) return null;
        try {
          const img = await generateOptimizedDesign(image, p, report);
          return { id: p.id, img };
        } catch (e) {
           console.error(`Image gen failed for ${p.name}`, e);
           return null;
        }
      });

      const imgResults = await Promise.all(imagePromises);
      
      const newImages: Record<string, string> = {};
      imgResults.forEach(res => {
        if (res) newImages[res.id] = res.img;
      });

      setOptimizedImages(newImages);

    } catch (err: any) {
      setError(err.message || "分析过程中发生未知错误。");
      setIsAnalyzing(false);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleCreatePersona = () => {
    if (!newPersonaData.name) return;
    
    const newId = Date.now().toString();
    const newPersona: Persona = {
      ...newPersonaData,
      id: newId,
    };
    
    setPersonas(prev => [...prev, newPersona]);
    // Automatically select the new persona
    setSelectedPersonaIds(prev => [...prev, newId]);
    setIsModalOpen(false);
    setNewPersonaData(EMPTY_PERSONA);
  };

  const updateNewPersonaAttr = (field: keyof typeof EMPTY_PERSONA.attributes, value: string) => {
    setNewPersonaData(prev => ({
      ...prev,
      attributes: {
        ...prev.attributes,
        [field]: value
      }
    }));
  };

  // Helper to generate PNG blob from a node
  const generatePngBlob = async (node: HTMLElement): Promise<Blob | null> => {
    const width = node.scrollWidth;
    const height = node.scrollHeight;
    const padding = 40;

    const dataUrl = await toPng(node, { 
      cacheBust: true, 
      backgroundColor: '#f8fafc',
      width: width + (padding * 2),
      height: height + (padding * 2),
      pixelRatio: 3,
      style: {
         padding: `${padding}px`,
         height: 'auto',
         width: 'auto',
         overflow: 'visible' 
      }
    });
    
    // Convert dataURL to Blob
    const res = await fetch(dataUrl);
    return res.blob();
  };

  const handleExportImage = async () => {
    if (!reportRef.current) return;
    
    setIsExporting(true);
    try {
      const blob = await generatePngBlob(reportRef.current);
      if (blob) {
        const currentPersonaName = personas.find(p => p.id === viewingPersonaId)?.name || 'Report';
        FileSaver.saveAs(blob, `UES_Report_${currentPersonaName}.png`);
      }
    } catch (err) {
      console.error('Failed to export image:', err);
      setError('导出图片失败，请重试。');
    } finally {
      setIsExporting(false);
    }
  };

  const handleBatchExport = async () => {
    const reportIds = Object.keys(reports);
    if (reportIds.length === 0) return;

    setIsBatchExporting(true);
    try {
      const zip = new JSZip();
      
      // Iterate over all generated reports
      for (const id of reportIds) {
        const persona = personas.find(p => p.id === id);
        const name = persona?.name || `Persona_${id}`;
        
        // Find the hidden element for this report
        const elementId = `report-capture-${id}`;
        const element = document.getElementById(elementId);
        
        if (element) {
          const blob = await generatePngBlob(element);
          if (blob) {
            zip.file(`UES_Report_${name}.png`, blob);
          }
        }
      }

      // Generate Zip and save
      const content = await zip.generateAsync({ type: 'blob' });
      FileSaver.saveAs(content, 'UES_Analysis_Reports.zip');

    } catch (err) {
      console.error('Batch export failed:', err);
      setError('批量导出失败，请重试。');
    } finally {
      setIsBatchExporting(false);
    }
  };

  // Get current report to display
  const currentReport = reports[viewingPersonaId];
  const currentOptimizedImage = optimizedImages[viewingPersonaId];
  
  // Check if we have multiple reports for batch export logic
  const hasMultipleReports = Object.keys(reports).length > 1;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 font-sans text-slate-900">
      
      {/* Hidden Container for Batch Capture - Renders ALL reports off-screen */}
      {Object.keys(reports).length > 0 && (
        <div style={{ position: 'fixed', left: '-10000px', top: 0, opacity: 0, pointerEvents: 'none' }}>
          {Object.entries(reports).map(([id, report]) => (
            <div 
              key={id} 
              id={`report-capture-${id}`} 
              className="w-[1024px] bg-slate-50 p-8" // Fixed width for consistent export layout
            >
              <div className="bg-white rounded-xl shadow-none p-8">
                 <div className="mb-8 border-b border-slate-200 pb-4">
                    <h1 className="text-3xl font-bold text-slate-800 mb-2">UES 体验评估报告</h1>
                    <div className="flex items-center gap-4 text-slate-500">
                      <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-semibold">
                         {personas.find(p => p.id === id)?.name}
                      </span>
                      <span>{new Date().toLocaleDateString()}</span>
                    </div>
                 </div>
                 <ReportView 
                    report={report} 
                    originalImage={image}
                    optimizedImage={optimizedImages[id]}
                    isGeneratingImage={false} // For export, we assume generation is done or we capture what we have
                  />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sidebar / Configuration Panel */}
      <div className="w-full md:w-96 bg-white border-r border-slate-200 h-auto md:h-screen flex flex-col sticky top-0 z-20 overflow-y-auto print:hidden">
        
        {/* Brand */}
        <div className="p-6 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <Sparkles size={24} fill="currentColor" className="text-indigo-500" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900">UES Agent</h1>
          </div>
          <p className="text-xs text-slate-500 font-medium">产品体验自动化分析工具</p>
        </div>

        {/* Step 1: Upload */}
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">1</span>
            上传设计图
          </h2>
          
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all relative group ${image ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'}`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange} 
            />
            
            {image ? (
              <div className="relative">
                <img src={image} alt="Preview" className="w-full h-40 object-contain rounded-md mb-2" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors rounded-md">
                  <p className="text-white opacity-0 group-hover:opacity-100 text-xs font-bold bg-black/50 px-3 py-1 rounded-full">更换图片</p>
                </div>
                <p className="text-xs text-indigo-600 font-medium mt-2 flex items-center justify-center gap-1">
                  <Check size={12} /> 图片已加载
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4 text-slate-400">
                <Upload size={32} className="mb-2" />
                <p className="text-sm font-medium text-slate-600">点击上传 UI 界面</p>
                <p className="text-xs">支持 PNG, JPG, WebP</p>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Evaluation Model Switcher */}
        <div className="p-6 border-b border-slate-100">
           <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">2</span>
            评估模型
          </h2>
          <div className="flex p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setEvaluationModel(EvaluationModel.UES)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-all ${evaluationModel === EvaluationModel.UES ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Layers size={14} /> UES (5维度)
            </button>
            <button
              onClick={() => setEvaluationModel(EvaluationModel.ETS)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-all ${evaluationModel === EvaluationModel.ETS ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Layers size={14} /> ETS (8维度)
            </button>
          </div>
          <div className="mt-2 text-[10px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
            {evaluationModel === EvaluationModel.UES 
              ? "通用易用性系统：关注易用性、一致性、清晰度、美观度、效率。" 
              : "体验追踪系统：包含功能、认知、交互、性能、安全、视觉、智能、运营 8 大维度。"}
          </div>
        </div>

        {/* Step 3: Persona Selection (Multi-select) */}
        <div className="p-6 border-b border-slate-100 flex-1">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">3</span>
              选择测评角色
              <span className="ml-1 text-xs font-normal normal-case text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                已选 {selectedPersonaIds.length}
              </span>
            </h2>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 bg-indigo-50 rounded-md transition-colors"
            >
              <Plus size={14} />
              新建
            </button>
          </div>
          
          <div className="space-y-3">
            {personas.map((p) => {
              const isSelected = selectedPersonaIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePersonaSelection(p.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all relative flex items-start gap-3 ${isSelected ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-1 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300 bg-white'}`}
                >
                  <div className={`mt-0.5 ${isSelected ? 'text-indigo-600' : 'text-slate-300'}`}>
                    {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-semibold text-sm ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>{p.name}</span>
                      {p.role === UserRole.EXPERT && <span className="text-[10px] bg-slate-800 text-white px-1.5 py-0.5 rounded">专家</span>}
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-2">{p.description}</p>
                    
                    {/* Mini attributes visualization */}
                    <div className="flex gap-1 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500">
                        {p.attributes.techSavviness} 科技感
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500">
                        {p.attributes.age}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Button */}
        <div className="p-6 bg-white sticky bottom-0 border-t border-slate-200 z-10">
          <button
            onClick={handleAnalyze}
            disabled={!image || isAnalyzing || isGeneratingImage || selectedPersonaIds.length === 0}
            className={`w-full py-3 px-4 rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
              !image || isAnalyzing || isGeneratingImage || selectedPersonaIds.length === 0
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-200'
            }`}
          >
            {isAnalyzing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                正在并行分析 ({selectedPersonaIds.length} 个角色)...
              </>
            ) : isGeneratingImage ? (
               <>
                <Loader2 size={18} className="animate-spin" />
                生成优化方案中...
              </>
            ) : (
              <>
                开始 {evaluationModel} 评估
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area - Reports */}
      <div className="flex-1 overflow-auto h-screen bg-slate-50 p-4 md:p-8 print:h-auto print:overflow-visible print:p-0">
        <div className="max-w-5xl mx-auto">
          
          {/* Empty State */}
          {Object.keys(reports).length === 0 && !isAnalyzing && !error && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 mt-20 opacity-60 print:hidden">
              <div className="w-32 h-32 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                <Sparkles size={48} className="text-indigo-300" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">准备就绪</h2>
              <p className="text-slate-500 max-w-md">
                请在左侧上传设计截图、勾选需要测评的角色（支持多选），然后点击开始。
              </p>
            </div>
          )}

          {/* Loading State */}
          {isAnalyzing && (
             <div className="flex flex-col items-center justify-center h-[60vh] space-y-6 print:hidden">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold text-slate-800">AI 正在进行多维度会诊...</h3>
                  <p className="text-sm text-slate-500">正在并行处理 {selectedPersonaIds.length} 个角色的 {evaluationModel} 评估。</p>
                </div>
             </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-red-700 text-sm text-center mt-10 print:hidden">
              {error}
            </div>
          )}

          {/* Report Tabs & View */}
          {Object.keys(reports).length > 0 && !isAnalyzing && (
            <div className="animate-fade-in space-y-6">
              
              {/* Report Switcher Tabs */}
              <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur py-2 border-b border-slate-200 print:hidden flex justify-between items-center flex-wrap gap-2">
                 <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar max-w-[60%]">
                    <span className="text-xs font-bold text-slate-400 uppercase mr-2 shrink-0">当前查看:</span>
                    {selectedPersonaIds.map(id => {
                      const persona = personas.find(p => p.id === id);
                      if (!persona) return null;
                      const hasReport = !!reports[id];
                      const isActive = viewingPersonaId === id;
                      
                      return (
                        <button
                          key={id}
                          onClick={() => hasReport && setViewingPersonaId(id)}
                          disabled={!hasReport}
                          className={`
                            flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap
                            ${isActive 
                              ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-200 ring-offset-2 ring-offset-slate-50' 
                              : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'}
                            ${!hasReport ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                        >
                          <Users size={14} />
                          {persona.name}
                        </button>
                      );
                    })}
                 </div>

                 {/* Export Buttons */}
                 <div className="flex items-center gap-2 ml-auto">
                    {/* Single Export */}
                    {currentReport && (
                      <button
                        onClick={handleExportImage}
                        disabled={isExporting || isBatchExporting}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-indigo-600 transition-colors shadow-sm whitespace-nowrap"
                        title="导出当前查看的角色报告"
                      >
                        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        <span className="hidden sm:inline">导出长图</span>
                      </button>
                    )}

                    {/* Batch Export */}
                    {hasMultipleReports && (
                      <button
                        onClick={handleBatchExport}
                        disabled={isExporting || isBatchExporting}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 border border-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap"
                        title="打包下载所有角色的报告"
                      >
                         {isBatchExporting ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
                         <span className="hidden sm:inline">批量导出 (ZIP)</span>
                      </button>
                    )}
                 </div>
              </div>

              {/* Render Active Report */}
              {currentReport ? (
                 <div className="pt-2" ref={reportRef}>
                   <ReportView 
                     report={currentReport} 
                     originalImage={image}
                     optimizedImage={currentOptimizedImage}
                     isGeneratingImage={isGeneratingImage}
                   />
                 </div>
              ) : (
                <div className="text-center py-20 text-slate-400">
                  未找到该角色的报告数据。
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Create Persona Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden relative flex flex-col z-10 animate-fade-in">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-500" />
                创建自定义角色
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Basic Info */}
                <div className="md:col-span-2 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">角色名称 <span className="text-red-500">*</span></label>
                        <input 
                          type="text" 
                          value={newPersonaData.name}
                          onChange={(e) => setNewPersonaData({...newPersonaData, name: e.target.value})}
                          placeholder="例如：年轻的游戏玩家"
                          className="w-full rounded-lg border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 px-3 border bg-white text-slate-900"
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">测评类型</label>
                        <select 
                          value={newPersonaData.role}
                          onChange={(e) => setNewPersonaData({...newPersonaData, role: e.target.value as UserRole})}
                          className="w-full rounded-lg border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 px-3 border bg-white text-slate-900"
                        >
                          <option value={UserRole.USER}>普通用户 (User)</option>
                          <option value={UserRole.EXPERT}>专家 (Expert)</option>
                        </select>
                     </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">角色描述</label>
                    <textarea 
                      value={newPersonaData.description}
                      onChange={(e) => setNewPersonaData({...newPersonaData, description: e.target.value})}
                      placeholder="简要描述该角色的背景和特点..."
                      className="w-full rounded-lg border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 px-3 border h-20 resize-none bg-white text-slate-900"
                    />
                  </div>
                </div>

                <div className="md:col-span-2 py-2">
                  <div className="h-px bg-slate-100"></div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2 block">详细属性配置</span>
                </div>

                {/* Attributes - Left Column */}
                <div className="space-y-4">
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">年龄段</label>
                      <input 
                        type="text" 
                        value={newPersonaData.attributes.age}
                        onChange={(e) => updateNewPersonaAttr('age', e.target.value)}
                        placeholder="例如：25-30岁"
                        className="w-full rounded-lg border-slate-200 focus:border-indigo-500 text-sm py-2 px-3 border bg-white text-slate-900"
                      />
                   </div>
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">科技熟练度</label>
                       <select 
                          value={newPersonaData.attributes.techSavviness}
                          onChange={(e) => updateNewPersonaAttr('techSavviness', e.target.value)}
                          className="w-full rounded-lg border-slate-200 focus:border-indigo-500 text-sm py-2 px-3 border bg-white text-slate-900"
                        >
                          <option value="低">低 (小白)</option>
                          <option value="中">中 (普通)</option>
                          <option value="高">高 (极客)</option>
                        </select>
                   </div>
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">领域知识</label>
                      <input 
                        type="text" 
                        value={newPersonaData.attributes.domainKnowledge}
                        onChange={(e) => updateNewPersonaAttr('domainKnowledge', e.target.value)}
                        placeholder="例如：新手 / 专家"
                        className="w-full rounded-lg border-slate-200 focus:border-indigo-500 text-sm py-2 px-3 border bg-white text-slate-900"
                      />
                   </div>
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">设备习惯</label>
                      <input 
                        type="text" 
                        value={newPersonaData.attributes.deviceHabits}
                        onChange={(e) => updateNewPersonaAttr('deviceHabits', e.target.value)}
                        placeholder="例如：单手操作手机"
                        className="w-full rounded-lg border-slate-200 focus:border-indigo-500 text-sm py-2 px-3 border bg-white text-slate-900"
                      />
                   </div>
                </div>

                {/* Attributes - Right Column */}
                <div className="space-y-4">
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">核心目标</label>
                      <input 
                        type="text" 
                        value={newPersonaData.attributes.goals}
                        onChange={(e) => updateNewPersonaAttr('goals', e.target.value)}
                        placeholder="例如：快速完成支付"
                        className="w-full rounded-lg border-slate-200 focus:border-indigo-500 text-sm py-2 px-3 border bg-white text-slate-900"
                      />
                   </div>
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">使用环境</label>
                      <input 
                        type="text" 
                        value={newPersonaData.attributes.environment}
                        onChange={(e) => updateNewPersonaAttr('environment', e.target.value)}
                        placeholder="例如：嘈杂的地铁"
                        className="w-full rounded-lg border-slate-200 focus:border-indigo-500 text-sm py-2 px-3 border bg-white text-slate-900"
                      />
                   </div>
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">挫折容忍度</label>
                       <select 
                          value={newPersonaData.attributes.frustrationTolerance}
                          onChange={(e) => updateNewPersonaAttr('frustrationTolerance', e.target.value)}
                          className="w-full rounded-lg border-slate-200 focus:border-indigo-500 text-sm py-2 px-3 border bg-white text-slate-900"
                        >
                          <option value="低">低 (容易放弃)</option>
                          <option value="中">中 (愿意尝试)</option>
                          <option value="高">高 (极有耐心)</option>
                        </select>
                   </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleCreatePersona}
                disabled={!newPersonaData.name}
                className={`px-4 py-2 text-sm font-bold text-white rounded-lg shadow-sm transition-all ${!newPersonaData.name ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                保存角色
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}