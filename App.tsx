import React, { useState, useRef, useEffect } from 'react';
import { Upload, Sparkles, Settings, ChevronRight, Check, Loader2, Plus, X, Layers, Square, CheckSquare, Users, Download, Archive, Package, Globe, FileUp, FileJson, Trash2, GripVertical, ImagePlus, Pencil, Video, Film, Zap, Star, Moon, Sun, ArrowRight } from 'lucide-react';
import { toPng } from 'html-to-image';
import JSZip from 'jszip';
import * as FileSaver from 'file-saver';
import { Persona, ETSReport, UserRole, EvaluationModel, ApiConfig, ProcessStep } from './types';
import { analyzeDesign, generateOptimizedDesign } from './services/geminiService';
import { ReportView } from './components/ReportView';

// --- Helper for FileSaver ---
const saveFile = (data: Blob | string, filename: string) => {
  const save = (FileSaver as any).saveAs || (FileSaver as any).default || FileSaver;
  if (typeof save === 'function') {
    save(data, filename);
  } else {
    console.error("FileSaver saveAs function not found", FileSaver);
    alert("Unable to save file due to a library loading error.");
  }
};

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
    name: '年轻用户',
    role: UserRole.USER,
    description: '追求极致效率，熟知快捷键的年轻人。',
    attributes: {
      age: '25-35岁',
      techSavviness: '高',
      domainKnowledge: '专家',
      goals: '最快速度完成任务',
      environment: '繁忙的办公室',
      frustrationTolerance: '中',
      deviceHabits: '重度手机使用者，快速操作'
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
  },
  {
    id: 'pm-1',
    name: '产品经理 (PM) 视角',
    role: UserRole.EXPERT,
    description: '【需求阶段】关注业务逻辑闭环、功能完整性及边缘情况处理。',
    attributes: {
      age: '30-40岁',
      techSavviness: '高',
      domainKnowledge: '业务专家',
      goals: '验证MVP功能完整性，确保业务价值传达，检查异常流程',
      environment: '会议室/办公桌',
      frustrationTolerance: '中',
      deviceHabits: '关注流程逻辑而非像素细节'
    }
  },
  {
    id: 'compliance-1',
    name: '合规风控官',
    role: UserRole.EXPERT,
    description: '【需求/风控】严格审查数据隐私保护、法律免责声明及业务合规性。',
    attributes: {
      age: '40-50岁',
      techSavviness: '中',
      domainKnowledge: '法律/风控专家',
      goals: '确保零合规风险，隐私条款清晰，无误导性宣传',
      environment: '严谨的办公环境',
      frustrationTolerance: '极低 (对违规零容忍)',
      deviceHabits: '仔细阅读所有小字条款'
    }
  },
  {
    id: 'design-1',
    name: '视觉设计总监',
    role: UserRole.EXPERT,
    description: '【设计阶段】基于栅格系统、色彩心理学及 WCAG 标准进行审美审计。',
    attributes: {
      age: '28-38岁',
      techSavviness: '高',
      domainKnowledge: '设计专家',
      goals: '确保品牌一致性，视觉层级清晰，符合美学标准',
      environment: '配备 4K 显示器的设计工作室',
      frustrationTolerance: '低 (对对齐敏感)',
      deviceHabits: '像素眼，关注间距、字体和留白'
    }
  },
  {
    id: 'a11y-1',
    name: '无障碍体验专家',
    role: UserRole.EXPERT,
    description: '【设计/研发】模拟视障/色弱视角，检查 WCAG 标准、对比度及读屏兼容性。',
    attributes: {
      age: '30-45岁',
      techSavviness: '极高 (辅助技术专家)',
      domainKnowledge: '无障碍标准 (WCAG)',
      goals: '确保残障人士可独立完成核心任务',
      environment: '使用读屏软件/键盘导航的测试室',
      frustrationTolerance: '低',
      deviceHabits: '仅键盘操作，高对比度模式'
    }
  },
  {
    id: 'ops-1',
    name: '增长运营专家',
    role: UserRole.EXPERT,
    description: '【运营阶段】关注转化率(CRO)、文案诱惑力及用户留存钩子。',
    attributes: {
      age: '25-35岁',
      techSavviness: '高',
      domainKnowledge: '营销专家',
      goals: '最大化点击率和转化率，降低流失，增强情感连接',
      environment: '数据监控中心',
      frustrationTolerance: '中',
      deviceHabits: '关注 CTA 按钮、文案及引导路径'
    }
  },
  {
    id: 'cs-1',
    name: '客户成功经理 (CSM)',
    role: UserRole.EXPERT,
    description: '【运营/服务】关注新手引导流畅度、报错文案友好性及降低客诉率。',
    attributes: {
      age: '25-35岁',
      techSavviness: '中',
      domainKnowledge: '客户服务',
      goals: '让用户"不求人"解决问题，降低客诉',
      environment: '客服中心',
      frustrationTolerance: '中',
      deviceHabits: '模拟用户遇到困难时的求助路径'
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
  { value: "nvidia/nemotron-nano-12b-v2-vl:free", label: "Nemotron Nano 12B VL (NVIDIA)", hint: "英伟达小模型，限时免费，用于测试，速度慢" },
  { value: "z-ai/glm-4.6v", label: "GLM-4.6V (智谱)", hint: "智谱混合专家，速度一般，价格低廉" },
  { value: "bytedance-seed/seed-1.6-flash", label: "Seed 1.6 Flash (字节)", hint: "字节最新模型，价格低廉，速度极快" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (Google)", hint: "Google 先进模型，质量较好" }
];

const GOOGLE_IMAGE_MODELS = [
  { value: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image (Google)" },
  { value: "google/gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image (Google)" }
];

const OPENROUTER_IMAGE_MODELS = [
  { value: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image (Google)" },
  { value: "google/gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image (Google)" },
  { value: "openai/gpt-5-image", label: "GPT-5 Image (OpenAI)" }
];

// --- Main App Component ---
export default function App() {
  const [personas, setPersonas] = useState<Persona[]>(DEFAULT_PERSONAS);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([DEFAULT_PERSONAS[0].id]);
  const [viewingPersonaId, setViewingPersonaId] = useState<string>(DEFAULT_PERSONAS[0].id);
  const evaluationModel = EvaluationModel.ETS;
  
  // Accordion Stepper State
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  
  // Input State
  const [uploadMode, setUploadMode] = useState<'single' | 'flow' | 'video'>('single');
  const [image, setImage] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>([]);
  
  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reports, setReports] = useState<Record<string, ETSReport>>({});
  const [error, setError] = useState<string | null>(null);
  
  // Image Generation State
  const [shouldGenerateImages, setShouldGenerateImages] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [optimizedImages, setOptimizedImages] = useState<Record<string, string>>({});
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newPersonaData, setNewPersonaData] = useState<Omit<Persona, 'id'>>(EMPTY_PERSONA);

  // Settings State
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    provider: 'google',
    openRouterModel: 'google/gemini-2.5-flash',
    imageModel: 'google/gemini-3-pro-image-preview'
  });

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const flowStepInputRef = useRef<HTMLInputElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);

  const getSelectedPersonas = () => personas.filter(p => selectedPersonaIds.includes(p.id));

  // Step completion status
  const isStep1Complete = 
    (uploadMode === 'single' && !!image) || 
    (uploadMode === 'flow' && processSteps.length > 0) ||
    (uploadMode === 'video' && !!video);
    
  const isStep2Complete = selectedPersonaIds.length > 0;
  
  // Get upload summary for collapsed state
  const getUploadSummary = () => {
    if (uploadMode === 'single' && image) return '已上传：1 张图片';
    if (uploadMode === 'flow' && processSteps.length > 0) return `已上传：${processSteps.length} 张流程图`;
    if (uploadMode === 'video' && video) return '已上传：1 个视频';
    return '未上传';
  };
  
  // Get persona summary for collapsed state  
  const getPersonaSummary = () => {
    return `准备模拟 ${selectedPersonaIds.length} 种用户类型`;
  };
  
  // Handle step navigation
  const goToNextStep = () => {
    if (activeStep === 1 && isStep1Complete) {
      setActiveStep(2);
    } else if (activeStep === 2 && isStep2Complete) {
      setActiveStep(3);
    }
  };
  
  const goToStep = (step: 1 | 2 | 3) => {
    // Allow going to step 1 always
    // Allow going to step 2 if step 1 is complete
    // Allow going to step 3 if step 1 and 2 are complete
    if (step === 1) {
      setActiveStep(1);
    } else if (step === 2 && isStep1Complete) {
      setActiveStep(2);
    } else if (step === 3 && isStep1Complete && isStep2Complete) {
      setActiveStep(3);
    }
  };

  // Single File Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setVideo(null);
        setReports({}); 
        setOptimizedImages({});
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Video File Handler
  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg'];
      if (!validTypes.includes(file.type)) {
         alert("格式不支持。请上传 mp4, webm 或 mov 格式的视频。");
         return;
      }
      
      if (file.size > 50 * 1024 * 1024) {
          alert("视频文件过大 (>50MB)。当前环境不支持前端压缩，请上传较小的文件以避免浏览器内存溢出。");
          return;
      }
      
      setImage(null);
      setReports({});
      setOptimizedImages({});
      setError(null);

      const reader = new FileReader();
      reader.onloadend = () => {
          setVideo(reader.result as string);
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
    
    setReports({});
    setOptimizedImages({});
    setError(null);
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
        if (prev.length === 1) return prev; 
        return prev.filter(pId => pId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleAnalyze = async () => {
    let inputData: string | ProcessStep[] | null = null;
    
    if (uploadMode === 'single') inputData = image;
    else if (uploadMode === 'flow') inputData = processSteps.length > 0 ? processSteps : null;
    else if (uploadMode === 'video') inputData = video;

    if (!inputData) return;

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
    setViewingPersonaId(targets[0].id);

    try {
      const analysisPromises = targets.map(async (p) => {
        try {
          const result = await analyzeDesign(inputData!, p, evaluationModel, apiConfig);
          return { id: p.id, report: result };
        } catch (e: any) {
          console.error(`Analysis failed for ${p.name}`, e);
          throw new Error(`${p.name} 分析失败: ${e.message}`);
        }
      });

      const results = await Promise.all(analysisPromises);
      
      const newReports: Record<string, ETSReport> = {};
      results.forEach(res => {
        if (res) newReports[res.id] = res.report;
      });

      setReports(newReports);
      setIsAnalyzing(false); 

      if (shouldGenerateImages && uploadMode !== 'video') {
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
      setIsAnalyzing(false);
    }
  };

  const handleSavePersona = () => {
    if (!newPersonaData.name) return;
    
    if (editingPersonaId) {
      setPersonas(prev => prev.map(p => 
        p.id === editingPersonaId 
          ? { ...p, ...newPersonaData } as Persona
          : p
      ));
    } else {
      const newId = Date.now().toString();
      const newPersona: Persona = {
        ...newPersonaData,
        id: newId,
      };
      setPersonas(prev => [...prev, newPersona]);
      setSelectedPersonaIds(prev => [...prev, newId]);
    }
    
    handleCloseModal();
  };

  const handleEditPersona = (e: React.MouseEvent, persona: Persona) => {
    e.stopPropagation();
    setNewPersonaData({
      name: persona.name,
      role: persona.role,
      description: persona.description,
      attributes: { ...persona.attributes }
    });
    setEditingPersonaId(persona.id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setNewPersonaData(EMPTY_PERSONA);
    setEditingPersonaId(null);
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

  // Export Logic
  const handleExportPersona = (e: React.MouseEvent, persona: Persona) => {
    e.stopPropagation();
    const { id, ...dataToSave } = persona;
    const blob = new Blob([JSON.stringify(dataToSave, null, 2)], { type: 'application/json' });
    saveFile(blob, `ETS_Persona_${persona.name.replace(/\s+/g, '_')}.json`);
  };

  const handleDownloadTemplate = () => {
    const template = { ...EMPTY_PERSONA, name: "示例角色模版", description: "请在此处填写描述..." };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    saveFile(blob, 'ETS_Persona_Template.json');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const content = ev.target?.result as string;
          const data = JSON.parse(content);
          
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
    if (jsonImportRef.current) jsonImportRef.current.value = '';
  };

  const generatePngBlob = async (node: HTMLElement): Promise<Blob | null> => {
    if (!node) return null;
    const width = node.scrollWidth;
    const height = node.scrollHeight;
    const padding = 40;

    const dataUrl = await toPng(node, { 
      cacheBust: true, 
      backgroundColor: '#F2F4F8',
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
        saveFile(blob, `ETS_Report_${currentPersonaName}.png`);
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
      
      for (const id of reportIds) {
        const persona = personas.find(p => p.id === id);
        const name = persona?.name || `Persona_${id}`;
        
        const elementId = `report-capture-${id}`;
        const element = document.getElementById(elementId);
        
        if (element) {
          const blob = await generatePngBlob(element);
          if (blob) {
            zip.file(`ETS_Report_${name}.png`, blob);
          }
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      saveFile(content as unknown as Blob, 'ETS_Analysis_Reports.zip');

    } catch (err) {
      console.error('Batch export failed:', err);
      setError('批量导出失败，请重试。');
    } finally {
      setIsBatchExporting(false);
    }
  };

  const currentReport = reports[viewingPersonaId];
  const currentOptimizedImage = optimizedImages[viewingPersonaId];
  const hasMultipleReports = Object.keys(reports).length > 1;

  const isReadyToAnalyze = 
    (uploadMode === 'single' && !!image) || 
    (uploadMode === 'flow' && processSteps.length > 0) ||
    (uploadMode === 'video' && !!video);

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-body" style={{ background: 'linear-gradient(145deg, #F2F4F8 0%, #E8ECF4 100%)' }}>
      
      {/* Hidden Container for Batch Capture */}
      {Object.keys(reports).length > 0 && (
        <div style={{ position: 'fixed', left: '-10000px', top: 0, opacity: 0, pointerEvents: 'none' }}>
          {Object.entries(reports).map(([id, report]) => (
            <div 
              key={id} 
              id={`report-capture-${id}`} 
              className="w-[1024px] p-8"
              style={{ background: 'linear-gradient(145deg, #F2F4F8 0%, #E8ECF4 100%)' }}
            >
              <div className="clay-card p-8">
                 <div className="mb-8 border-b border-clay-200/50 pb-4">
                    <h1 className="text-3xl font-bold text-clay-800 mb-2 font-display">ETS 体验评估报告</h1>
                    <div className="flex items-center gap-4 text-clay-500">
                      <span className="clay-badge px-4 py-1.5 text-sm font-semibold" style={{ background: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 100%)', color: '#7C3AED' }}>
                         {personas.find(p => p.id === id)?.name}
                      </span>
                      <span>{new Date().toLocaleDateString()}</span>
                    </div>
                 </div>
                 <ReportView 
                    report={report} 
                    originalImage={uploadMode === 'video' ? video : image}
                    processSteps={uploadMode === 'flow' ? processSteps : undefined}
                    optimizedImage={optimizedImages[id]}
                    isGeneratingImage={false}
                  />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========== Sidebar / Configuration Panel ========== */}
      <div className="w-full md:w-[400px] h-auto md:h-screen flex flex-col sticky top-0 z-20 overflow-hidden print:hidden p-4 md:p-5">
        <div className="clay-card-raised flex-1 flex flex-col overflow-hidden rounded-[28px]">
          
          {/* Brand Header */}
          <div className="p-6 flex justify-between items-center" style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{
                background: 'linear-gradient(145deg, #A78BFA 0%, #8B5CF6 50%, #7C3AED 100%)',
                boxShadow: '0 6px 20px -4px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)'
              }}>
                <Sparkles size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-clay-800 font-display">ETS Agent</h1>
                <p className="text-xs text-clay-500 font-medium">产品体验自动化分析工具</p>
              </div>
            </div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="clay-btn p-2.5 text-clay-400 hover:text-accent-violet transition-colors"
              title="API 设置"
            >
              <Settings size={18} />
            </button>
          </div>

          {/* Accordion Stepper Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            
            {/* ===== Step 1: Upload ===== */}
            <div 
              className={`accordion-step rounded-3xl transition-all duration-500 ease-out overflow-hidden ${
                activeStep === 1 
                  ? 'clay-card-raised step-expanded' 
                  : 'step-collapsed cursor-pointer hover:opacity-100'
              }`}
              style={{
                opacity: activeStep === 1 ? 1 : 0.7,
                boxShadow: activeStep === 1 
                  ? '0 12px 32px -8px rgba(139, 92, 246, 0.25), inset 0 1px 0 rgba(255,255,255,0.9)' 
                  : '0 2px 8px -2px rgba(0,0,0,0.06)',
                background: activeStep === 1 
                  ? 'linear-gradient(145deg, #FFFFFF 0%, #F8FAFC 100%)' 
                  : 'linear-gradient(145deg, #F5F7FA 0%, #EAEEF4 100%)',
              }}
              onClick={() => activeStep !== 1 && goToStep(1)}
            >
              {/* Step 1 Header - Always visible */}
              <div 
                className={`flex items-center gap-3 transition-all duration-300 ${
                  activeStep === 1 ? 'p-5 pb-4' : 'p-4'
                }`}
              >
                {/* Step indicator */}
                <div 
                  className={`shrink-0 rounded-full flex items-center justify-center transition-all duration-300 ${
                    activeStep === 1 ? 'w-8 h-8' : 'w-7 h-7'
                  }`}
                  style={{
                    background: isStep1Complete && activeStep !== 1
                      ? 'linear-gradient(145deg, #34D399 0%, #10B981 100%)'
                      : 'linear-gradient(145deg, #A78BFA 0%, #8B5CF6 100%)',
                    boxShadow: activeStep === 1 
                      ? '0 4px 12px -2px rgba(139, 92, 246, 0.4)' 
                      : '0 2px 6px -2px rgba(139, 92, 246, 0.3)'
                  }}
                >
                  {isStep1Complete && activeStep !== 1 ? (
                    <Check size={14} className="text-white step-check-icon" strokeWidth={3} />
                  ) : (
                    <span className="text-white text-xs font-bold">1</span>
                  )}
                </div>
                
                {/* Title & Summary */}
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold transition-all duration-300 ${
                    activeStep === 1 ? 'text-sm text-clay-800' : 'text-xs text-clay-600'
                  }`}>
                    {activeStep === 1 ? '上传需测内容' : (isStep1Complete ? getUploadSummary() : '上传需测内容')}
                  </h3>
                  {activeStep !== 1 && !isStep1Complete && (
                    <p className="text-[10px] text-clay-400 mt-0.5">点击展开</p>
                  )}
                </div>
                
                {/* Expand indicator */}
                <ChevronRight 
                  size={16} 
                  className={`text-clay-400 transition-transform duration-300 ${
                    activeStep === 1 ? 'rotate-90' : ''
                  }`}
                />
              </div>
              
              {/* Step 1 Content - Expandable */}
              <div 
                className={`accordion-content transition-all duration-500 ease-out ${
                  activeStep === 1 ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
                }`}
                style={{ overflow: 'hidden' }}
              >
                <div className="px-5 pb-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                  {/* Toggle Mode */}
                  <div className="clay-inset p-1.5 rounded-2xl flex gap-1">
                    {[
                      { key: 'single', label: '单页', icon: null },
                      { key: 'flow', label: '流程', icon: null },
                      { key: 'video', label: '视频', icon: Video }
                    ].map(mode => (
                      <button 
                        key={mode.key}
                        onClick={() => setUploadMode(mode.key as any)}
                        className={`flex-1 py-2.5 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                          uploadMode === mode.key 
                            ? 'clay-tab active text-accent-violet' 
                            : 'text-clay-500 hover:text-clay-700'
                        }`}
                      >
                        {mode.icon && <mode.icon size={12} />}
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  {uploadMode === 'single' && (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className={`rounded-3xl p-6 text-center cursor-pointer transition-all ${
                        image 
                          ? 'clay-selected' 
                          : 'clay-inset hover:shadow-soft'
                      }`}
                      style={{ border: image ? undefined : '2px dashed rgba(139, 92, 246, 0.2)' }}
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
                          <img src={image} alt="预览" className="max-h-28 mx-auto rounded-2xl" style={{ boxShadow: '0 8px 24px -6px rgba(0,0,0,0.15)' }} />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/5 rounded-2xl opacity-0 hover:opacity-100 transition-opacity">
                            <span className="clay-badge px-4 py-2 text-xs font-semibold text-clay-700">更换图片</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-clay-400 py-2">
                          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{
                            background: 'linear-gradient(145deg, #E8ECF4 0%, #F0F3F9 100%)',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)'
                          }}>
                            <Upload size={20} className="text-clay-400" />
                          </div>
                          <span className="text-xs font-medium">点击上传图片</span>
                        </div>
                      )}
                    </div>
                  )}

                  {uploadMode === 'video' && (
                    <div 
                      onClick={() => videoInputRef.current?.click()}
                      className={`rounded-3xl p-6 text-center cursor-pointer transition-all ${
                        video 
                          ? 'clay-selected' 
                          : 'clay-inset hover:shadow-soft'
                      }`}
                      style={{ border: video ? undefined : '2px dashed rgba(139, 92, 246, 0.2)' }}
                    >
                      <input 
                        ref={videoInputRef}
                        type="file" 
                        accept="video/mp4,video/webm,video/quicktime" 
                        onChange={handleVideoChange} 
                        className="hidden" 
                      />
                      {video ? (
                        <div className="relative">
                          <video src={video} className="max-h-28 mx-auto rounded-2xl bg-black" style={{ boxShadow: '0 8px 24px -6px rgba(0,0,0,0.15)' }} />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/5 rounded-2xl opacity-0 hover:opacity-100 transition-opacity">
                            <span className="clay-badge px-4 py-2 text-xs font-semibold text-clay-700">更换视频</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-clay-400 py-2">
                          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{
                            background: 'linear-gradient(145deg, #E8ECF4 0%, #F0F3F9 100%)',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)'
                          }}>
                            <Film size={20} className="text-clay-400" />
                          </div>
                          <span className="text-xs font-medium">点击上传视频</span>
                          <span className="text-[10px] clay-badge px-3 py-1" style={{ background: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 100%)', color: '#7C3AED' }}>限制 50MB</span>
                        </div>
                      )}
                    </div>
                  )}

                  {uploadMode === 'flow' && (
                    <div className="space-y-3">
                      {processSteps.length > 0 && (
                        <div className="space-y-2">
                          {processSteps.map((step, idx) => (
                            <div key={step.id} className="clay-card p-3 group relative rounded-2xl">
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                <button onClick={() => removeStep(step.id)} className="clay-btn p-1.5 text-clay-400 hover:text-accent-rose">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                              
                              <div className="flex gap-3 items-start">
                                <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden" style={{ boxShadow: '0 4px 12px -4px rgba(0,0,0,0.1)' }}>
                                  <img src={step.image} alt={`步骤 ${idx+1}`} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1">
                                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md inline-block mb-1.5" style={{
                                    background: 'linear-gradient(145deg, #A78BFA 0%, #8B5CF6 100%)',
                                    color: 'white',
                                  }}>步骤 {idx + 1}</span>
                                  <textarea 
                                    value={step.description}
                                    onChange={(e) => updateStepDescription(step.id, e.target.value)}
                                    placeholder="输入操作说明..."
                                    className="clay-input w-full text-[11px] p-2 outline-none resize-none"
                                    rows={2}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div 
                        onClick={handleAddFlowStep}
                        className="clay-inset rounded-2xl p-4 text-center cursor-pointer hover:shadow-soft transition-all flex flex-col items-center justify-center gap-1.5 text-clay-400"
                        style={{ border: '2px dashed rgba(139, 92, 246, 0.2)' }}
                      >
                        <input 
                          ref={flowStepInputRef}
                          type="file" 
                          accept="image/*" 
                          multiple
                          onChange={handleFlowImageSelect}
                          className="hidden" 
                        />
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                          background: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 100%)',
                          color: '#8B5CF6'
                        }}>
                          <ImagePlus size={14} />
                        </div>
                        <span className="text-[11px] font-medium">添加流程截图</span>
                      </div>
                    </div>
                  )}

                  {/* Next Step Button */}
                  <button
                    onClick={goToNextStep}
                    disabled={!isStep1Complete}
                    className={`w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold transition-all ${
                      isStep1Complete
                        ? 'text-white'
                        : 'bg-clay-200 text-clay-400 cursor-not-allowed'
                    }`}
                    style={isStep1Complete ? {
                      background: 'linear-gradient(145deg, #A78BFA 0%, #8B5CF6 100%)',
                      boxShadow: '0 6px 16px -4px rgba(139, 92, 246, 0.4)'
                    } : {}}
                  >
                    <span>下一步</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* ===== Step 2: Personas ===== */}
            <div 
              className={`accordion-step rounded-3xl transition-all duration-500 ease-out overflow-hidden ${
                activeStep === 2 
                  ? 'clay-card-raised step-expanded' 
                  : 'step-collapsed'
              } ${activeStep !== 2 && isStep1Complete ? 'cursor-pointer hover:opacity-100' : ''}`}
              style={{
                opacity: activeStep === 2 ? 1 : (isStep1Complete ? 0.7 : 0.4),
                boxShadow: activeStep === 2 
                  ? '0 12px 32px -8px rgba(56, 189, 248, 0.25), inset 0 1px 0 rgba(255,255,255,0.9)' 
                  : '0 2px 8px -2px rgba(0,0,0,0.06)',
                background: activeStep === 2 
                  ? 'linear-gradient(145deg, #FFFFFF 0%, #F8FAFC 100%)' 
                  : 'linear-gradient(145deg, #F5F7FA 0%, #EAEEF4 100%)',
                pointerEvents: !isStep1Complete && activeStep !== 2 ? 'none' : 'auto'
              }}
              onClick={() => activeStep !== 2 && isStep1Complete && goToStep(2)}
            >
              {/* Step 2 Header */}
              <div 
                className={`flex items-center gap-3 transition-all duration-300 ${
                  activeStep === 2 ? 'p-5 pb-4' : 'p-4'
                }`}
              >
                <div 
                  className={`shrink-0 rounded-full flex items-center justify-center transition-all duration-300 ${
                    activeStep === 2 ? 'w-8 h-8' : 'w-7 h-7'
                  }`}
                  style={{
                    background: isStep2Complete && isStep1Complete && activeStep !== 2
                      ? 'linear-gradient(145deg, #34D399 0%, #10B981 100%)'
                      : 'linear-gradient(145deg, #38BDF8 0%, #0EA5E9 100%)',
                    boxShadow: activeStep === 2 
                      ? '0 4px 12px -2px rgba(56, 189, 248, 0.4)' 
                      : '0 2px 6px -2px rgba(56, 189, 248, 0.3)'
                  }}
                >
                  {isStep2Complete && isStep1Complete && activeStep !== 2 ? (
                    <Check size={14} className="text-white step-check-icon" strokeWidth={3} />
                  ) : (
                    <span className="text-white text-xs font-bold">2</span>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold transition-all duration-300 ${
                    activeStep === 2 ? 'text-sm text-clay-800' : 'text-xs text-clay-600'
                  }`}>
                    {activeStep === 2 ? '选择模拟角色' : (isStep2Complete ? getPersonaSummary() : '选择模拟角色')}
                  </h3>
                  {activeStep !== 2 && !isStep1Complete && (
                    <p className="text-[10px] text-clay-400 mt-0.5">请先完成上一步</p>
                  )}
                </div>
                
                <ChevronRight 
                  size={16} 
                  className={`text-clay-400 transition-transform duration-300 ${
                    activeStep === 2 ? 'rotate-90' : ''
                  }`}
                />
              </div>
              
              {/* Step 2 Content */}
              <div 
                className={`accordion-content transition-all duration-500 ease-out ${
                  activeStep === 2 ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
                }`}
                style={{ overflow: 'hidden' }}
              >
                <div className="px-5 pb-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                  {/* Actions */}
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={handleDownloadTemplate}
                      className="clay-btn p-2 text-clay-400 hover:text-accent-violet transition-colors"
                      title="下载角色模版"
                    >
                      <FileJson size={14} />
                    </button>
                    <button 
                      onClick={() => {
                        setNewPersonaData(EMPTY_PERSONA);
                        setEditingPersonaId(null);
                        setIsModalOpen(true);
                      }}
                      className="clay-btn p-2 transition-colors"
                      style={{ 
                        background: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 100%)',
                        color: '#8B5CF6'
                      }}
                      title="新建角色"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  
                  {/* Persona List */}
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {personas.map(persona => {
                      const isSelected = selectedPersonaIds.includes(persona.id);
                      const isCustom = !['1', '2', '3', 'pm-1', 'design-1', 'ops-1', 'compliance-1', 'a11y-1', 'cs-1'].includes(persona.id);
                      return (
                        <div 
                          key={persona.id}
                          onClick={() => togglePersonaSelection(persona.id)}
                          className={`p-3 rounded-2xl cursor-pointer transition-all duration-200 relative group flex items-start gap-3 ${
                            isSelected
                              ? 'clay-selected' 
                              : 'clay-card hover:shadow-soft'
                          }`}
                        >
                          <div className={`mt-0.5 w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                            isSelected ? '' : 'clay-inset'
                          }`} style={isSelected ? {
                            background: 'linear-gradient(145deg, #A78BFA 0%, #8B5CF6 100%)',
                            boxShadow: '0 2px 8px -2px rgba(139, 92, 246, 0.4)'
                          } : {}}>
                            {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <span className={`font-semibold text-xs block truncate pr-6 ${isSelected ? 'text-accent-violet' : 'text-clay-700'}`}>
                              {persona.name}
                            </span>
                            <p className={`text-[11px] line-clamp-1 mt-0.5 ${isSelected ? 'text-accent-violet/70' : 'text-clay-500'}`}>
                              {persona.description}
                            </p>
                          </div>
                          
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isCustom && (
                              <button 
                                onClick={(e) => handleEditPersona(e, persona)}
                                className="clay-btn p-1.5 text-clay-400 hover:text-accent-violet"
                                title="编辑角色"
                              >
                                <Pencil size={10} />
                              </button>
                            )}
                            <button 
                              onClick={(e) => handleExportPersona(e, persona)}
                              className="clay-btn p-1.5 text-clay-400 hover:text-accent-violet"
                              title="导出角色配置"
                            >
                              <Download size={10} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Generate Image Option */}
                  <div 
                    onClick={() => uploadMode !== 'video' && setShouldGenerateImages(!shouldGenerateImages)}
                    className={`clay-card p-3 rounded-2xl flex items-center gap-3 cursor-pointer transition-all ${uploadMode === 'video' ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-soft'}`}
                  >
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                      shouldGenerateImages ? '' : 'clay-inset'
                    }`} style={shouldGenerateImages ? {
                      background: 'linear-gradient(145deg, #34D399 0%, #10B981 100%)',
                      boxShadow: '0 2px 8px -2px rgba(52, 211, 153, 0.4)'
                    } : {}}>
                      {shouldGenerateImages && <Check size={12} className="text-white" />}
                    </div>
                    <div className="flex-1">
                      <span className={`text-xs font-medium ${shouldGenerateImages ? 'text-accent-emerald' : 'text-clay-600'}`}>
                        生成优化效果图
                      </span>
                    </div>
                  </div>

                  {/* Next Step Button */}
                  <button
                    onClick={goToNextStep}
                    disabled={!isStep2Complete}
                    className={`w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold transition-all ${
                      isStep2Complete
                        ? 'text-white'
                        : 'bg-clay-200 text-clay-400 cursor-not-allowed'
                    }`}
                    style={isStep2Complete ? {
                      background: 'linear-gradient(145deg, #38BDF8 0%, #0EA5E9 100%)',
                      boxShadow: '0 6px 16px -4px rgba(56, 189, 248, 0.4)'
                    } : {}}
                  >
                    <span>下一步</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* ===== Step 3: Analyze ===== */}
            <div 
              className={`accordion-step rounded-3xl transition-all duration-500 ease-out overflow-hidden ${
                activeStep === 3 
                  ? 'clay-card-raised step-expanded' 
                  : 'step-collapsed'
              } ${activeStep !== 3 && isStep1Complete && isStep2Complete ? 'cursor-pointer hover:opacity-100' : ''}`}
              style={{
                opacity: activeStep === 3 ? 1 : (isStep1Complete && isStep2Complete ? 0.7 : 0.4),
                boxShadow: activeStep === 3 
                  ? '0 12px 32px -8px rgba(52, 211, 153, 0.25), inset 0 1px 0 rgba(255,255,255,0.9)' 
                  : '0 2px 8px -2px rgba(0,0,0,0.06)',
                background: activeStep === 3 
                  ? 'linear-gradient(145deg, #FFFFFF 0%, #F8FAFC 100%)' 
                  : 'linear-gradient(145deg, #F5F7FA 0%, #EAEEF4 100%)',
                pointerEvents: !(isStep1Complete && isStep2Complete) && activeStep !== 3 ? 'none' : 'auto'
              }}
              onClick={() => activeStep !== 3 && isStep1Complete && isStep2Complete && goToStep(3)}
            >
              {/* Step 3 Header */}
              <div 
                className={`flex items-center gap-3 transition-all duration-300 ${
                  activeStep === 3 ? 'p-5 pb-4' : 'p-4'
                }`}
              >
                <div 
                  className={`shrink-0 rounded-full flex items-center justify-center transition-all duration-300 ${
                    activeStep === 3 ? 'w-8 h-8' : 'w-7 h-7'
                  }`}
                  style={{
                    background: 'linear-gradient(145deg, #34D399 0%, #10B981 100%)',
                    boxShadow: activeStep === 3 
                      ? '0 4px 12px -2px rgba(52, 211, 153, 0.4)' 
                      : '0 2px 6px -2px rgba(52, 211, 153, 0.3)'
                  }}
                >
                  <span className="text-white text-xs font-bold">3</span>
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold transition-all duration-300 ${
                    activeStep === 3 ? 'text-sm text-clay-800' : 'text-xs text-clay-600'
                  }`}>
                    开始分析
                  </h3>
                  {activeStep !== 3 && !(isStep1Complete && isStep2Complete) && (
                    <p className="text-[10px] text-clay-400 mt-0.5">请先完成前两步</p>
                  )}
                </div>
                
                <ChevronRight 
                  size={16} 
                  className={`text-clay-400 transition-transform duration-300 ${
                    activeStep === 3 ? 'rotate-90' : ''
                  }`}
                />
              </div>
              
              {/* Step 3 Content */}
              <div 
                className={`accordion-content transition-all duration-500 ease-out ${
                  activeStep === 3 ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'
                }`}
                style={{ overflow: 'hidden' }}
              >
                <div className="px-5 pb-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                  {/* Summary Info */}
                  <div className="clay-inset p-4 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-clay-500">上传内容</span>
                      <span className="text-clay-700 font-medium">{getUploadSummary()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-clay-500">模拟角色</span>
                      <span className="text-clay-700 font-medium">{selectedPersonaIds.length} 个</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-clay-500">生成效果图</span>
                      <span className="text-clay-700 font-medium">{shouldGenerateImages ? '是' : '否'}</span>
                    </div>
                  </div>
                  
                  {/* Analyze Button */}
                  <button 
                    onClick={handleAnalyze}
                    disabled={!isReadyToAnalyze || isAnalyzing || selectedPersonaIds.length === 0}
                    className={`w-full py-4 px-6 rounded-2xl flex items-center justify-center gap-3 font-bold text-white transition-all transform active:scale-[0.98] ${
                      !isReadyToAnalyze || isAnalyzing || selectedPersonaIds.length === 0
                        ? 'bg-clay-300 cursor-not-allowed' 
                        : 'clay-btn-primary hover:scale-[1.01]'
                    }`}
                    style={isReadyToAnalyze && !isAnalyzing && selectedPersonaIds.length > 0 ? {
                      background: 'linear-gradient(145deg, #34D399 0%, #10B981 50%, #059669 100%)',
                      boxShadow: '0 8px 24px -4px rgba(52, 211, 153, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)'
                    } : {}}
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        <span>分析中...</span>
                      </>
                    ) : (
                      <>
                        <Zap size={20} />
                        <span>开始全维度审计</span>
                      </>
                    )}
                  </button>
                  <div className="text-center">
                    <span className="text-[11px] text-clay-400">预计消耗: {selectedPersonaIds.length} x Token</span>
                  </div>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </div>

      {/* ========== Main Content Area ========== */}
      <div className="flex-1 overflow-y-auto relative h-screen p-4 md:p-5 md:pl-0">
        
        {/* Top Navigation Bar (Tabs) */}
        {Object.keys(reports).length > 0 && (
          <div className="clay-card mb-5 p-3 flex items-center justify-between sticky top-0 z-20" style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(16px)' }}>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {Object.keys(reports).map(id => {
                const persona = personas.find(p => p.id === id);
                const isActive = viewingPersonaId === id;
                return (
                  <button
                    key={id}
                    onClick={() => setViewingPersonaId(id)}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2 ${
                      isActive 
                        ? '' 
                        : 'clay-btn text-clay-600'
                    }`}
                    style={isActive ? {
                      background: 'linear-gradient(145deg, #A78BFA 0%, #8B5CF6 50%, #7C3AED 100%)',
                      color: 'white',
                      boxShadow: '0 6px 20px -4px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)'
                    } : {}}
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
                className={`clay-btn p-2.5 text-clay-500 hover:text-accent-violet ${!hasMultipleReports ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="批量导出所有报告 (ZIP)"
              >
                {isBatchExporting ? <Loader2 size={18} className="animate-spin" /> : <Package size={18} />}
              </button>
              <button 
                onClick={handleExportImage}
                disabled={isExporting}
                className="clay-btn p-2.5 text-clay-500 hover:text-accent-violet"
                title="导出当前报告 (PNG)"
              >
                {isExporting ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />}
              </button>
            </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto">
          {isAnalyzing ? (
            <div className="clay-card-raised flex flex-col items-center justify-center h-[70vh] text-center space-y-8 p-12 rounded-[32px]">
              <div className="relative animate-float">
                <div className="w-24 h-24 rounded-3xl flex items-center justify-center" style={{
                  background: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 100%)',
                  boxShadow: '0 12px 32px -8px rgba(139, 92, 246, 0.3), inset 0 1px 0 rgba(255,255,255,0.9)'
                }}>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center animate-spin" style={{ animationDuration: '2s' }}>
                    <Sparkles className="text-accent-violet" size={32} />
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-clay-800 font-display">ETS 智能体正在深度思考...</h3>
                <p className="text-clay-500 mt-3 max-w-md">正在进行多维度拆解、模拟 {selectedPersonaIds.length} 个用户角色的交互行为...</p>
              </div>
              <div className="clay-progress w-64 h-2">
                <div className="clay-progress-bar h-full animate-pulse" style={{ width: '60%' }}></div>
              </div>
            </div>
          ) : error ? (
            <div className="clay-card-raised flex flex-col items-center justify-center h-[70vh] text-center p-12 rounded-[32px]">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6" style={{
                background: 'linear-gradient(145deg, #FEE2E2 0%, #FECACA 100%)',
                boxShadow: '0 8px 24px -6px rgba(251, 113, 133, 0.3)'
              }}>
                <X size={36} className="text-accent-rose" />
              </div>
              <h3 className="text-xl font-bold text-clay-800 font-display">分析中断</h3>
              <p className="text-clay-500 max-w-md mt-3">{error}</p>
            </div>
          ) : currentReport ? (
            <div ref={reportRef} id={`report-view-${viewingPersonaId}`} className="clay-card-raised p-8 md:p-10 rounded-[32px] animate-fade-in-up">
              <div className="mb-8 pb-6 flex justify-between items-end" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <div>
                  <h2 className="text-3xl font-bold text-clay-800 mb-3 font-display">ETS 体验评估报告</h2>
                  <div className="flex items-center gap-3 text-clay-500 text-sm">
                    <span className="clay-badge px-4 py-1.5 font-semibold" style={{
                      background: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 100%)',
                      color: '#7C3AED'
                    }}>
                      {personas.find(p => p.id === viewingPersonaId)?.name}
                    </span>
                    <span>•</span>
                    <span>{new Date().toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{
                  background: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)'
                }}>
                  <Sparkles className="text-accent-violet/50" size={28} />
                </div>
              </div>
              <ReportView 
                report={currentReport} 
                originalImage={uploadMode === 'video' ? video : image}
                processSteps={uploadMode === 'flow' ? processSteps : undefined}
                optimizedImage={currentOptimizedImage}
                isGeneratingImage={isGeneratingImage}
              />
            </div>
          ) : (
            <div className="clay-card-raised flex flex-col items-center justify-center h-[70vh] text-center space-y-8 p-12 rounded-[32px]">
              <div className="w-32 h-32 rounded-[40px] flex items-center justify-center animate-float" style={{
                background: 'linear-gradient(145deg, #E8ECF4 0%, #F0F3F9 100%)',
                boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.08), inset 0 -2px 0 rgba(255,255,255,0.6)'
              }}>
                <Layers size={48} className="text-clay-400" />
              </div>
              <div className="max-w-lg">
                <h3 className="text-2xl font-bold text-clay-800 font-display">准备就绪</h3>
                <p className="text-clay-500 mt-3 leading-relaxed">请上传界面截图、视频或业务流程，并选择模拟用户画像，ETS Agent 将为您生成专业的体验审计报告。</p>
              </div>
              <div className="flex items-center gap-3 text-clay-400">
                <ArrowRight size={16} />
                <span className="text-sm">从左侧面板开始</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========== Settings Modal ========== */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in">
          <div className="clay-card-raised w-full max-w-md overflow-hidden rounded-[28px]">
            <div className="p-5 flex justify-between items-center" style={{ 
              background: 'linear-gradient(145deg, #F8FAFC 0%, #F2F4F8 100%)',
              borderBottom: '1px solid rgba(0,0,0,0.04)'
            }}>
              <h3 className="font-bold text-clay-800 flex items-center gap-2.5 font-display">
                <Settings size={18} className="text-accent-violet" />
                系统设置
              </h3>
              <button onClick={() => setIsSettingsOpen(false)} className="clay-btn p-2 text-clay-400 hover:text-clay-600">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              
              {/* Provider Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-clay-700 block">AI 模型提供商</label>
                <div className="clay-inset p-1.5 rounded-2xl flex gap-1">
                  {['google', 'openrouter'].map(provider => (
                    <button 
                      key={provider}
                      onClick={() => setApiConfig({...apiConfig, provider: provider as any})}
                      className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all ${
                        apiConfig.provider === provider 
                          ? 'clay-tab active text-accent-violet' 
                          : 'text-clay-500 hover:text-clay-700'
                      }`}
                    >
                      {provider === 'google' ? 'Google GenAI' : 'OpenRouter'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Provider Info */}
              {apiConfig.provider === 'google' && (
                <div className="clay-card p-4 rounded-2xl" style={{ background: 'linear-gradient(145deg, #EFF6FF 0%, #DBEAFE 100%)' }}>
                  <p className="text-sm text-blue-700">
                    <strong>分析模型：</strong>读取/分析采用 <code className="bg-blue-100 px-1.5 py-0.5 rounded-lg font-semibold">gemini-2.5-flash</code>
                  </p>
                  <p className="text-xs text-blue-600 mt-1.5">视觉生成模型仅用于生成优化效果图。</p>
                </div>
              )}
              {apiConfig.provider === 'openrouter' && (
                <div className="clay-card p-4 rounded-2xl" style={{ background: 'linear-gradient(145deg, #FFFBEB 0%, #FEF3C7 100%)' }}>
                  <p className="text-sm text-amber-700">
                    <strong>提示：</strong>API Key 需在 <code className="bg-amber-100 px-1.5 py-0.5 rounded-lg">.env.local</code> 中配置
                  </p>
                  <code className="block mt-2 text-xs text-amber-600 bg-amber-100 p-3 rounded-xl font-mono">
                    OPENROUTER_API_KEY=sk-or-...
                  </code>
                </div>
              )}

              {/* Text Model Selection (OpenRouter Only) */}
              {apiConfig.provider === 'openrouter' && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-clay-700 block">分析模型</label>
                  <select
                    value={apiConfig.openRouterModel}
                    onChange={(e) => setApiConfig({...apiConfig, openRouterModel: e.target.value})}
                    className="clay-input w-full p-3.5 outline-none text-sm"
                  >
                    {OPENROUTER_TEXT_MODELS.map(model => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </select>
                  {(() => {
                    const selectedModel = OPENROUTER_TEXT_MODELS.find(m => m.value === apiConfig.openRouterModel);
                    return selectedModel?.hint && (
                      <p className="text-xs text-clay-500 clay-inset px-3 py-2.5 rounded-xl">
                        💡 {selectedModel.hint}
                      </p>
                    );
                  })()}
                </div>
              )}

              {/* Image Model Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-clay-700 block">视觉生成模型</label>
                <select
                  value={apiConfig.imageModel}
                  onChange={(e) => setApiConfig({...apiConfig, imageModel: e.target.value})}
                  className="clay-input w-full p-3.5 outline-none text-sm"
                >
                  {(apiConfig.provider === 'google' ? GOOGLE_IMAGE_MODELS : OPENROUTER_IMAGE_MODELS).map(model => (
                    <option key={model.value} value={model.value}>{model.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="p-5 flex justify-end" style={{ 
              background: 'linear-gradient(145deg, #F8FAFC 0%, #F2F4F8 100%)',
              borderTop: '1px solid rgba(0,0,0,0.04)'
            }}>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="px-6 py-2.5 rounded-xl font-medium text-white transition-all"
                style={{
                  background: 'linear-gradient(145deg, #A78BFA 0%, #8B5CF6 50%, #7C3AED 100%)',
                  boxShadow: '0 6px 20px -4px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)'
                }}
              >
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== Create/Edit Persona Modal ========== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in">
          <div className="clay-card-raised w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col rounded-[28px]">
            <div className="p-6 flex justify-between items-center" style={{ 
              background: 'linear-gradient(145deg, #F8FAFC 0%, #F2F4F8 100%)',
              borderBottom: '1px solid rgba(0,0,0,0.04)'
            }}>
              <h3 className="text-xl font-bold text-clay-800 font-display">
                {editingPersonaId ? '编辑用户画像' : '新建用户画像'}
              </h3>
              <button onClick={handleCloseModal} className="clay-btn p-2 text-clay-400 hover:text-clay-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-clay-700 mb-2">角色名称</label>
                  <input 
                    type="text" 
                    value={newPersonaData.name}
                    onChange={(e) => setNewPersonaData({...newPersonaData, name: e.target.value})}
                    className="clay-input w-full p-3.5 outline-none"
                    placeholder="例如：忙碌的家庭主妇"
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-clay-700 mb-2">评估角色类型</label>
                  <select 
                    value={newPersonaData.role}
                    onChange={(e) => setNewPersonaData({...newPersonaData, role: e.target.value as UserRole})}
                    className="clay-input w-full p-3.5 outline-none bg-transparent"
                  >
                    <option value={UserRole.USER}>普通用户</option>
                    <option value={UserRole.EXPERT}>专家评审</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-clay-700 mb-2">简短描述</label>
                  <input 
                    type="text" 
                    value={newPersonaData.description}
                    onChange={(e) => setNewPersonaData({...newPersonaData, description: e.target.value})}
                    className="clay-input w-full p-3.5 outline-none"
                    placeholder="一句话描述该角色的核心特征"
                  />
                </div>
              </div>

              {/* Import Button */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => jsonImportRef.current?.click()}
                  className="text-xs flex items-center gap-1.5 font-medium px-4 py-2 rounded-xl transition-colors"
                  style={{
                    background: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 100%)',
                    color: '#7C3AED'
                  }}
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
                <h4 className="text-sm font-bold text-clay-400 uppercase tracking-wider mb-4">详细属性设定</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.keys(EMPTY_PERSONA.attributes).map((key) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-clay-500 mb-2 capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </label>
                      <input 
                        type="text" 
                        value={(newPersonaData.attributes as any)[key]}
                        onChange={(e) => updateNewPersonaAttr(key as any, e.target.value)}
                        className="clay-input w-full p-3 text-sm outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-6 flex justify-end gap-3" style={{ 
              background: 'linear-gradient(145deg, #F8FAFC 0%, #F2F4F8 100%)',
              borderTop: '1px solid rgba(0,0,0,0.04)'
            }}>
              <button 
                onClick={handleCloseModal}
                className="clay-btn px-5 py-2.5 text-clay-600 font-medium"
              >
                取消
              </button>
              <button 
                onClick={handleSavePersona}
                disabled={!newPersonaData.name}
                className={`px-6 py-2.5 rounded-xl font-medium text-white transition-all ${!newPersonaData.name ? 'opacity-50 cursor-not-allowed bg-clay-300' : ''}`}
                style={newPersonaData.name ? {
                  background: 'linear-gradient(145deg, #A78BFA 0%, #8B5CF6 50%, #7C3AED 100%)',
                  boxShadow: '0 6px 20px -4px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)'
                } : {}}
              >
                {editingPersonaId ? '保存修改' : '创建角色'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}