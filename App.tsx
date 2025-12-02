
import React, { useState, useRef, useEffect } from 'react';
import { Upload, Sparkles, Settings, ChevronRight, Check, Loader2, Plus, X, Layers, Square, CheckSquare, Users, Download, Archive, Package, Globe, FileUp, FileJson, Trash2, GripVertical, ImagePlus } from 'lucide-react';
import { toPng } from 'html-to-image';
import JSZip from 'jszip';
import FileSaver from 'file-saver';
import { Persona, UESReport, UserRole, EvaluationModel, ApiConfig, ProcessStep } from './types';
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

const OPENROUTER_TEXT_MODELS = [
  { value: "google/gemini-3-pro-preview", label: "Gemini 3 Pro Preview (Google)" },
  { value: "qwen/qwen3-vl-235b-a22b-instruct", label: "Qwen 3 VL Instruct (Qwen)" },
  { value: "x-ai/grok-4.1-fast:free", label: "Grok 4.1 Fast (xAI)" }
];

const IMAGE_MODELS = [
  { value: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image (Google)" },
  { value: "google/gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image (Google)" },
  { value: "openai/gpt-5-image", label: "GPT-5 Image (OpenAI)" }
];

// --- Main App Component ---
export default function App() {
  const [personas, setPersonas] = useState<Persona[]>(DEFAULT_PERSONAS);
  
  // Multi-select state
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([DEFAULT_PERSONAS[0].id]);
  
  // Result Viewer State (Which persona tab is active)
  const [viewingPersonaId, setViewingPersonaId] = useState<string>(DEFAULT_PERSONAS[0].id);

  const [evaluationModel, setEvaluationModel] = useState<EvaluationModel>(EvaluationModel.ETS); // Default to ETS as requested implicitly
  
  // Input State
  const [uploadMode, setUploadMode] = useState<'single' | 'flow'>('single');
  const [image, setImage] = useState<string | null>(null); // For single mode
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>([]); // For flow mode
  
  // Analysis State (Map by Persona ID)
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reports, setReports] = useState<Record<string, UESReport>>({});
  const [error, setError] = useState<string | null>(null);
  
  // Image Generation State (Map by Persona ID)
  const [shouldGenerateImages, setShouldGenerateImages] = useState(false); // Default to false (optional)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [optimizedImages, setOptimizedImages] = useState<Record<string, string>>({});
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newPersonaData, setNewPersonaData] = useState<Omit<Persona, 'id'>>(EMPTY_PERSONA);

  // Settings State
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    provider: 'google',
    openRouterKey: '',
    openRouterModel: 'google/gemini-3-pro-preview',
    imageModel: 'google/gemini-3-pro-image-preview'
  });

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const flowStepInputRef = useRef<HTMLInputElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);

  // Helper to get actual persona objects from selected IDs
  const getSelectedPersonas = () => personas.filter(p => selectedPersonaIds.includes(p.id));

  // Single File Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        // Clear previous results
        setReports({}); 
        setOptimizedImages({});
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Flow Handlers
  const handleAddFlowStep = () => {
    if (flowStepInputRef.current) {
        flowStepInputRef.current.click();
    }
  };

  const handleFlowImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Read all selected files
    files.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const newStep: ProcessStep = {
                id: Date.now().toString() + Math.random().toString(),
                image: reader.result as string,
                description: ''
            };
            setProcessSteps(prev => [...prev, newStep]);
        };
        reader.readAsDataURL(file);
    });
    
    // Clear results on new input
    setReports({});
    setOptimizedImages({});
    setError(null);
    
    // Reset input
    e.target.value = '';
  };

  const updateStepDescription = (id: string, text: string) => {
    setProcessSteps(prev => prev.map(step => 
        step.id === id ? { ...step, description: text } : step
    ));
  };

  const removeStep = (id: string) => {
    setProcessSteps(prev => prev.filter(step => step.id !== id));
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
    // Validate inputs
    const inputData = uploadMode === 'single' ? image : processSteps;
    if (uploadMode === 'single' && !image) return;
    if (uploadMode === 'flow' && processSteps.length === 0) return;
    
    if (!inputData) return;

    // Check for API Key if using Google
    if (apiConfig.provider === 'google') {
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
          const result = await analyzeDesign(inputData, p, evaluationModel, apiConfig);
          return { id: p.id, report: result };
        } catch (e: any) {
          console.error(`Analysis failed for ${p.name}`, e);
          throw new Error(`${p.name} 分析失败: ${e.message}`);
        }
      });

      const results = await Promise.all(analysisPromises);
      
      const newReports: Record<string, UESReport> = {};
      results.forEach(res => {
        if (res) newReports[res.id] = res.report;
      });

      setReports(newReports);
      setIsAnalyzing(false); 

      // 2. Parallel Image Generation (Optional)
      // Enable for both Google and OpenRouter ONLY IF CHECKED
      // IMPORTANT: For flows, we just use the first image or skip optimization logic if too complex, 
      // but here we just take the first image of the flow as the "representative" image to optimize if in flow mode.
      if (shouldGenerateImages) {
          setIsGeneratingImage(true);
          
          const sourceImage = uploadMode === 'single' ? (image as string) : processSteps[0]?.image;

          if (sourceImage) {
            const imagePromises = targets.map(async (p) => {
                const report = newReports[p.id];
                if (!report) return null;
                try {
                const img = await generateOptimizedDesign(sourceImage, p, report, apiConfig);
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
          }
      }

    } catch (err: any) {
      setError(err.message || "分析过程中发生未知错误。");
      setIsAnalyzing(false);
    } finally {
      setIsGeneratingImage(false);
      setIsAnalyzing(false); // Ensure this is off in case of catch
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

  // --- Import/Export Logic ---

  // Export a single persona configuration to JSON
  const handleExportPersona = (e: React.MouseEvent, persona: Persona) => {
    e.stopPropagation();
    const { id, ...dataToSave } = persona; // Exclude ID
    const blob = new Blob([JSON.stringify(dataToSave, null, 2)], { type: 'application/json' });
    FileSaver.saveAs(blob, `ETS_Persona_${persona.name.replace(/\s+/g, '_')}.json`);
  };

  // Download a template for creating new personas
  const handleDownloadTemplate = () => {
    const template = { ...EMPTY_PERSONA, name: "示例角色模版", description: "请在此处填写描述..." };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    FileSaver.saveAs(blob, 'ETS_Persona_Template.json');
  };

  // Import JSON to fill the modal
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const content = ev.target?.result as string;
          const data = JSON.parse(content);
          
          // Basic validation
          if (data.name && data.role && data.attributes) {
            setNewPersonaData({
              name: data.name,
              role: data.role,
              description: data.description || '',
              attributes: { ...EMPTY_PERSONA.attributes, ...data.attributes }
            });
          } else {
             alert('无效的 JSON 格式。请确保文件包含 name, role 和 attributes 字段。');
          }
        } catch (err) {
          console.error('JSON parsing error:', err);
          alert('解析 JSON 文件失败。');
        }
      };
      reader.readAsText(file);
    }
    // Reset input
    if (jsonImportRef.current) jsonImportRef.current.value = '';
  };


  // Helper to generate PNG blob from a node
  const generatePngBlob = async (node: HTMLElement): Promise<Blob | null> => {
    if (!node) return null;
    const width = node.scrollWidth;
    const height = node.scrollHeight;
    const padding = 40;

    const dataUrl = await toPng(node, { 
      cacheBust: true, 
      backgroundColor: '#f8fafc',
      width: width + (padding * 2),
      height: height + (padding * 2),
      pixelRatio: 2,
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
        FileSaver.saveAs(blob, `ETS_Report_${currentPersonaName}.png`);
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
            zip.file(`ETS_Report_${name}.png`, blob);
          }
        }
      }

      // Generate Zip and save
      const content = await zip.generateAsync({ type: 'blob' });
      FileSaver.saveAs(content, 'ETS_Analysis_Reports.zip');

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

  // Determine button enabled state
  const isReadyToAnalyze = uploadMode === 'single' ? !!image : processSteps.length > 0;

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
                    <h1 className="text-3xl font-bold text-slate-800 mb-2">ETS 体验评估报告</h1>
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
                    processSteps={uploadMode === 'flow' ? processSteps : undefined}
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
        <div className="p-6 border-b border-slate-100 bg-white flex justify-between items-center sticky top-0 z-30">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 mb-1">
              <Sparkles size={24} fill="currentColor" className="text-indigo-500" />
              <h1 className="text-xl font-bold tracking-tight text-slate-900">ETS Agent</h1>
            </div>
            <p className="text-xs text-slate-500 font-medium">产品体验自动化分析工具</p>
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="API 设置"
          >
            <Settings size={20} />
          </button>
        </div>

        {/* Step 1: Upload */}
        <div className="p-6 border-b border-slate-100 flex-1 overflow-y-auto">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">1. 上传需测内容</h2>
          
          {/* Toggle Mode */}
          <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
            <button 
                onClick={() => setUploadMode('single')}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${uploadMode === 'single' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
                单页模式
            </button>
            <button 
                onClick={() => setUploadMode('flow')}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${uploadMode === 'flow' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
                业务流程
            </button>
          </div>

          {uploadMode === 'single' ? (
            // Single Image Upload
            <div 
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${image ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'}`}
            >
                <input 
                ref={fileInputRef}
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                className="hidden" 
                />
                {image ? (
                <div className="relative">
                    <img src={image} alt="Preview" className="max-h-32 mx-auto rounded-lg shadow-sm" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-lg opacity-0 hover:opacity-100 transition-opacity">
                        <span className="bg-white text-slate-800 text-xs py-1 px-3 rounded shadow-sm font-medium">更换图片</span>
                    </div>
                </div>
                ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Upload size={24} />
                    <span className="text-sm font-medium">点击上传或拖入图片</span>
                </div>
                )}
            </div>
          ) : (
            // Flow Upload
            <div className="space-y-4">
                <div className="space-y-3">
                    {processSteps.map((step, idx) => (
                        <div key={step.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 group relative">
                             <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => removeStep(step.id)} className="p-1 bg-white rounded-full text-slate-400 hover:text-red-500 shadow-sm border border-slate-200">
                                    <Trash2 size={12} />
                                </button>
                             </div>
                             
                             <div className="flex gap-3 items-start">
                                 <div className="w-16 h-16 shrink-0 bg-white border border-slate-200 rounded-md flex items-center justify-center overflow-hidden">
                                     <img src={step.image} alt={`Step ${idx+1}`} className="w-full h-full object-cover" />
                                 </div>
                                 <div className="flex-1">
                                     <div className="flex justify-between items-center mb-1">
                                         <span className="text-xs font-bold text-slate-500 uppercase">步骤 {idx + 1}</span>
                                     </div>
                                     <textarea 
                                        value={step.description}
                                        onChange={(e) => updateStepDescription(step.id, e.target.value)}
                                        placeholder="输入用户操作说明 (如: 点击下一步)"
                                        className="w-full text-xs p-2 rounded border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none bg-white"
                                        rows={2}
                                     />
                                 </div>
                             </div>
                        </div>
                    ))}
                </div>

                <div 
                    onClick={handleAddFlowStep}
                    className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:border-indigo-400 hover:bg-slate-50 transition-all flex flex-col items-center justify-center gap-2 text-slate-400"
                >
                    <input 
                        ref={flowStepInputRef}
                        type="file" 
                        accept="image/*" 
                        multiple
                        onChange={handleFlowImageSelect}
                        className="hidden" 
                    />
                    <ImagePlus size={20} />
                    <span className="text-xs font-medium">添加流程截图 (支持多选)</span>
                </div>
            </div>
          )}
        </div>

        {/* Step 2: Personas */}
        <div className="p-6 border-b border-slate-100 bg-white">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">2. 选择模拟角色</h2>
            <div className="flex gap-2">
                <button 
                onClick={handleDownloadTemplate}
                className="text-slate-400 hover:text-indigo-600 transition-colors"
                title="下载角色模版"
                >
                <FileJson size={16} />
                </button>
                <button 
                onClick={() => setIsModalOpen(true)}
                className="text-indigo-600 hover:text-indigo-700 transition-colors"
                title="新建角色"
                >
                <Plus size={18} />
                </button>
            </div>
          </div>
          
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {personas.map(persona => {
                const isSelected = selectedPersonaIds.includes(persona.id);
                return (
                    <div 
                        key={persona.id}
                        onClick={() => togglePersonaSelection(persona.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all relative group ${
                        isSelected
                            ? 'bg-white border-indigo-500 shadow-md ring-1 ring-indigo-500' 
                            : 'bg-white border-slate-200 hover:border-indigo-300'
                        }`}
                    >
                        <div className="flex justify-between items-start mb-1">
                            <span className={`font-semibold text-sm ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>
                                {persona.name}
                            </span>
                            {isSelected ? (
                                <CheckSquare size={16} className="text-indigo-500" />
                            ) : (
                                <Square size={16} className="text-slate-300 group-hover:text-indigo-300" />
                            )}
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2">{persona.description}</p>
                        
                        {/* Export Button (only visible on hover) */}
                        <button 
                            onClick={(e) => handleExportPersona(e, persona)}
                            className="absolute bottom-2 right-2 p-1 text-slate-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="导出角色配置"
                        >
                            <Download size={14} />
                        </button>
                    </div>
                );
            })}
          </div>

          <div className="mt-6 space-y-4 border-t border-slate-100 pt-6">
             <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">附加选项</h2>
             </div>
             
             {/* Model Selector */}
            <div className="flex items-center justify-between">
               <label className="text-sm font-medium text-slate-600">评估模型</label>
               <select 
                 value={evaluationModel}
                 onChange={(e) => setEvaluationModel(e.target.value as EvaluationModel)}
                 className="text-xs bg-slate-100 border-none rounded-lg py-1 px-2 text-slate-700 focus:ring-2 focus:ring-indigo-500"
               >
                 <option value={EvaluationModel.ETS}>ETS (8 维度)</option>
                 <option value={EvaluationModel.UES}>UES (5 维度)</option>
               </select>
            </div>

            {/* Image Generation Toggle */}
            <div 
                onClick={() => setShouldGenerateImages(!shouldGenerateImages)}
                className="flex items-center gap-3 cursor-pointer group"
            >
                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${shouldGenerateImages ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                    {shouldGenerateImages && <Check size={14} className="text-white" />}
                </div>
                <div>
                   <span className={`text-sm font-medium transition-colors ${shouldGenerateImages ? 'text-indigo-700' : 'text-slate-600'}`}>生成优化效果图</span>
                   <p className="text-xs text-slate-400">AI 将尝试绘制优化后的界面</p>
                </div>
            </div>
          </div>
        </div>

        {/* Step 3: Analyze Button */}
        <div className="p-6 border-t border-slate-200 bg-white sticky bottom-0 z-30">
          <button 
            onClick={handleAnalyze}
            disabled={!isReadyToAnalyze || isAnalyzing || selectedPersonaIds.length === 0}
            className={`w-full py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-white shadow-lg transition-all transform active:scale-95 ${
                !isReadyToAnalyze || isAnalyzing || selectedPersonaIds.length === 0
                ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-indigo-200 hover:brightness-105'
            }`}
          >
            {isAnalyzing ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>分析中...</span>
              </>
            ) : (
              <>
                <Sparkles size={20} />
                <span>开始全维度审计</span>
              </>
            )}
          </button>
          <div className="text-center mt-2">
             <span className="text-xs text-slate-400">预计消耗: {selectedPersonaIds.length} x Token</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-slate-50/50 relative h-screen">
        
        {/* Top Navigation Bar (Tabs) */}
        {Object.keys(reports).length > 0 && (
             <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-3 flex items-center justify-between">
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {Object.keys(reports).map(id => {
                        const persona = personas.find(p => p.id === id);
                        return (
                            <button
                                key={id}
                                onClick={() => setViewingPersonaId(id)}
                                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2 ${
                                    viewingPersonaId === id 
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <Users size={14} />
                                {persona?.name}
                            </button>
                        )
                    })}
                </div>
                
                <div className="flex gap-2 shrink-0">
                    <button 
                        onClick={handleBatchExport}
                        disabled={isBatchExporting || !hasMultipleReports}
                        className={`p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors ${!hasMultipleReports ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="批量导出所有报告 (ZIP)"
                    >
                         {isBatchExporting ? <Loader2 size={20} className="animate-spin" /> : <Package size={20} />}
                    </button>
                    <button 
                        onClick={handleExportImage}
                        disabled={isExporting}
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                        title="导出当前报告 (PNG)"
                    >
                        {isExporting ? <Loader2 size={20} className="animate-spin" /> : <FileUp size={20} />}
                    </button>
                </div>
             </div>
        )}

        <div className="p-6 md:p-12 max-w-5xl mx-auto">
            {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
                    <div className="relative">
                        <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                        <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600" size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">ETS 智能体正在深度思考...</h3>
                        <p className="text-slate-500 mt-2">正在进行多维度拆解、模拟 {selectedPersonaIds.length} 个用户角色的交互行为...</p>
                    </div>
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                    <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
                        <X size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">分析中断</h3>
                    <p className="text-slate-500 max-w-md mt-2">{error}</p>
                </div>
            ) : currentReport ? (
                <div ref={reportRef} id={`report-view-${viewingPersonaId}`} className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100">
                     <div className="mb-8 border-b border-slate-100 pb-6 flex justify-between items-end">
                        <div>
                            <h2 className="text-3xl font-bold text-slate-800 mb-2">ETS 体验评估报告</h2>
                            <div className="flex items-center gap-2 text-slate-500 text-sm">
                                <span className="bg-slate-100 px-2 py-1 rounded-md font-medium text-slate-700">
                                    {personas.find(p => p.id === viewingPersonaId)?.name}
                                </span>
                                <span>•</span>
                                <span>{new Date().toLocaleDateString()}</span>
                            </div>
                        </div>
                        <Sparkles className="text-indigo-200" size={48} />
                     </div>
                     <ReportView 
                        report={currentReport} 
                        originalImage={image}
                        processSteps={uploadMode === 'flow' ? processSteps : undefined}
                        optimizedImage={currentOptimizedImage}
                        isGeneratingImage={isGeneratingImage}
                     />
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-6 opacity-50">
                    <div className="w-32 h-32 bg-slate-200 rounded-full flex items-center justify-center">
                        <Layers size={48} className="text-slate-400" />
                    </div>
                    <div className="max-w-md">
                        <h3 className="text-xl font-bold text-slate-800">准备就绪</h3>
                        <p className="text-slate-500 mt-2">请上传界面截图或业务流程，并选择模拟用户画像，ETS Agent 将为您生成专业的体验审计报告。</p>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Settings size={18} />
                系统设置
              </h3>
              <button onClick={() => setIsSettingsOpen(false)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              
              {/* Provider Selection */}
              <div className="space-y-3">
                 <label className="text-sm font-medium text-slate-700 block">AI 模型提供商</label>
                 <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                    <button 
                       onClick={() => setApiConfig({...apiConfig, provider: 'google'})}
                       className={`py-2 text-sm font-medium rounded-md transition-all ${apiConfig.provider === 'google' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                       Google GenAI
                    </button>
                    <button 
                       onClick={() => setApiConfig({...apiConfig, provider: 'openrouter'})}
                       className={`py-2 text-sm font-medium rounded-md transition-all ${apiConfig.provider === 'openrouter' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                       OpenRouter
                    </button>
                 </div>
              </div>

              {/* API Key Input */}
              {apiConfig.provider === 'openrouter' && (
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-700 block">OpenRouter API Key</label>
                    <input 
                        type="password" 
                        value={apiConfig.openRouterKey}
                        onChange={(e) => setApiConfig({...apiConfig, openRouterKey: e.target.value})}
                        placeholder="sk-or-..."
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-mono text-sm"
                    />
                  </div>
              )}

              {/* Text Model Selection (OpenRouter Only) */}
              {apiConfig.provider === 'openrouter' && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-700 block">文本分析模型 (Text Model)</label>
                  <select
                    value={apiConfig.openRouterModel}
                    onChange={(e) => setApiConfig({...apiConfig, openRouterModel: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  >
                    {OPENROUTER_TEXT_MODELS.map(model => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Image Model Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700 block">视觉生成模型 (Image Model)</label>
                <select
                  value={apiConfig.imageModel}
                  onChange={(e) => setApiConfig({...apiConfig, imageModel: e.target.value})}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                >
                  {IMAGE_MODELS.map(model => (
                    <option key={model.value} value={model.value}>{model.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  注意: GPT-5 Image 等模型仅在配置了 OpenRouter 时可用。Google GenAI 模式下请使用 Gemini 系列。
                </p>
              </div>

            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
              >
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Persona Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-bold text-slate-800">新建用户画像</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
               {/* Basic Info */}
               <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">角色名称</label>
                    <input 
                        type="text" 
                        value={newPersonaData.name}
                        onChange={(e) => setNewPersonaData({...newPersonaData, name: e.target.value})}
                        className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="例如：忙碌的家庭主妇"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">评估角色类型</label>
                    <select 
                        value={newPersonaData.role}
                        onChange={(e) => setNewPersonaData({...newPersonaData, role: e.target.value as UserRole})}
                        className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                        <option value={UserRole.USER}>普通用户 (User)</option>
                        <option value={UserRole.EXPERT}>专家评审 (Expert)</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">简短描述</label>
                    <input 
                        type="text" 
                        value={newPersonaData.description}
                        onChange={(e) => setNewPersonaData({...newPersonaData, description: e.target.value})}
                        className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="一句话描述该角色的核心特征"
                    />
                  </div>
               </div>

               {/* Import Button */}
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => jsonImportRef.current?.click()}
                        className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1.5 bg-indigo-50 rounded-lg transition-colors"
                    >
                        <FileUp size={14} />
                        导入 JSON 配置
                    </button>
                    <input 
                        ref={jsonImportRef}
                        type="file" 
                        accept=".json" 
                        onChange={handleImportJson} 
                        className="hidden" 
                    />
                </div>

               {/* Attributes Grid */}
               <div>
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">详细属性设定</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.keys(EMPTY_PERSONA.attributes).map((key) => (
                        <div key={key}>
                            <label className="block text-xs font-medium text-slate-500 mb-1 capitalize">
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                            </label>
                            <input 
                                type="text" 
                                value={(newPersonaData.attributes as any)[key]}
                                onChange={(e) => updateNewPersonaAttr(key as any, e.target.value)}
                                className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                    ))}
                  </div>
               </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleCreatePersona}
                disabled={!newPersonaData.name}
                className={`px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg shadow-lg shadow-indigo-200 transition-all ${!newPersonaData.name ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700 hover:scale-105'}`}
              >
                创建角色
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}