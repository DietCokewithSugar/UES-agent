import React, { useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import JSZip from 'jszip';
import * as FileSaver from 'file-saver';
import {
  ApiConfig,
  EvaluationFramework,
  EvaluationScenario,
  FrameworkReport,
  Persona,
  PersonaRecommendation,
  ProcessStep,
  UserRole
} from './types';
import { FRAMEWORK_PRESETS } from './config/frameworkPresets';
import { CUSTOM_FRAMEWORK_TEMPLATE, parseFrameworkJson } from './utils/frameworkSchema';
import {
  analyzeDesign,
  generateOptimizedDesign,
  inferScenarioFromInput,
  recommendPersonas
} from './services/geminiService';
import { ReportView } from './components/ReportView';
import { SummaryReport } from './components/SummaryReport';
import { ScenarioEditor } from './components/ScenarioEditor';
import { PersonaRecommendations } from './components/PersonaRecommendations';

const saveFile = (data: Blob | string, filename: string) => {
  const save = (FileSaver as any).saveAs || (FileSaver as any).default || FileSaver;
  if (typeof save === 'function') save(data, filename);
};

const DEFAULT_PERSONAS: Persona[] = [
  {
    id: 'p-elder',
    name: '银发新手用户',
    role: UserRole.USER,
    description: '科技素养较低，关注简单、安全、可见反馈。',
    attributes: {
      age: '65+',
      techSavviness: '低',
      domainKnowledge: '新手',
      goals: '无障碍完成核心任务',
      environment: '家庭环境',
      frustrationTolerance: '低',
      deviceHabits: '大字号、慢速操作'
    }
  },
  {
    id: 'p-young',
    name: '高效率年轻用户',
    role: UserRole.USER,
    description: '追求高效率、低阻力，偏好快捷路径。',
    attributes: {
      age: '22-35',
      techSavviness: '高',
      domainKnowledge: '中高',
      goals: '快速完成任务',
      environment: '移动办公',
      frustrationTolerance: '中',
      deviceHabits: '移动优先、快速滑动'
    }
  },
  {
    id: 'p-expert',
    name: 'UX 专家审计',
    role: UserRole.EXPERT,
    description: '从规范、可用性和一致性审查整体体验。',
    attributes: {
      age: '30-45',
      techSavviness: '高',
      domainKnowledge: '专家',
      goals: '识别系统性体验缺陷',
      environment: '设计评审环境',
      frustrationTolerance: '中',
      deviceHabits: '细节审查'
    }
  },
  {
    id: 'p-pm',
    name: '产品经理视角',
    role: UserRole.EXPERT,
    description: '关注业务闭环、转化路径、异常流程覆盖。',
    attributes: {
      age: '28-40',
      techSavviness: '高',
      domainKnowledge: '业务专家',
      goals: '验证业务目标是否被体验支撑',
      environment: '办公室',
      frustrationTolerance: '中',
      deviceHabits: '关注流程状态'
    }
  }
];

const EMPTY_PERSONA: Omit<Persona, 'id'> = {
  name: '',
  role: UserRole.USER,
  description: '',
  attributes: {
    age: '',
    techSavviness: '',
    domainKnowledge: '',
    goals: '',
    environment: '',
    frustrationTolerance: '',
    deviceHabits: ''
  }
};

const EMPTY_SCENARIO: EvaluationScenario = {
  industry: '',
  productType: '',
  businessGoal: '',
  targetUsers: '',
  keyTasks: '',
  painPoints: '',
  successCriteria: '',
  constraints: '',
  source: 'manual'
};

const OPENROUTER_TEXT_MODELS = [
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'bytedance-seed/seed-1.6-flash', label: 'Seed 1.6 Flash' },
  { value: 'z-ai/glm-4.6v', label: 'GLM-4.6V' }
];

const GOOGLE_IMAGE_MODELS = [
  { value: 'google/gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image' },
  { value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' }
];

const OPENROUTER_IMAGE_MODELS = [
  { value: 'google/gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image' },
  { value: 'google/gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
  { value: 'openai/gpt-5-image', label: 'GPT-5 Image' }
];

const STEP_TITLES = ['上传评测素材', '定义业务场景与目标', '选择评测体系', '选择评测角色'];

type PageMode = 'setup' | 'report';
type SetupStep = 1 | 2 | 3 | 4;
type UploadMode = 'single' | 'flow' | 'video';

export default function App() {
  const [pageMode, setPageMode] = useState<PageMode>('setup');
  const [activeStep, setActiveStep] = useState<SetupStep>(1);

  const [personas, setPersonas] = useState<Persona[]>(DEFAULT_PERSONAS);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);
  const [personaDraft, setPersonaDraft] = useState<Omit<Persona, 'id'>>(EMPTY_PERSONA);
  const [showPersonaForm, setShowPersonaForm] = useState(false);
  const [personaRecommendations, setPersonaRecommendations] = useState<PersonaRecommendation[]>([]);

  const [frameworks, setFrameworks] = useState<EvaluationFramework[]>(FRAMEWORK_PRESETS);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState('');

  const [uploadMode, setUploadMode] = useState<UploadMode>('single');
  const [image, setImage] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>([]);
  const [singleFileName, setSingleFileName] = useState('');
  const [videoFileName, setVideoFileName] = useState('');
  const [isDropActive, setIsDropActive] = useState(false);

  const [scenario, setScenario] = useState<EvaluationScenario>(EMPTY_SCENARIO);

  const [reports, setReports] = useState<Record<string, FrameworkReport>>({});
  const [viewingPersonaId, setViewingPersonaId] = useState<string>(DEFAULT_PERSONAS[0].id);
  const [showSummary, setShowSummary] = useState(false);

  const [isInferringScenario, setIsInferringScenario] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [shouldGenerateImages, setShouldGenerateImages] = useState(false);

  const [optimizedImages, setOptimizedImages] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    provider: 'google',
    openRouterModel: 'google/gemini-2.5-flash',
    imageModel: 'google/gemini-3-pro-image-preview'
  });

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const flowInputRef = useRef<HTMLInputElement>(null);
  const personaImportRef = useRef<HTMLInputElement>(null);
  const frameworkImportRef = useRef<HTMLInputElement>(null);
  const reportCaptureRef = useRef<HTMLDivElement>(null);
  const summaryCaptureRef = useRef<HTMLDivElement>(null);

  const selectedFramework = useMemo(
    () => frameworks.find((framework) => framework.id === selectedFrameworkId),
    [frameworks, selectedFrameworkId]
  );

  const selectedPersonas = useMemo(
    () => personas.filter((persona) => selectedPersonaIds.includes(persona.id)),
    [personas, selectedPersonaIds]
  );

  const currentInput = useMemo(() => {
    if (uploadMode === 'single') return image;
    if (uploadMode === 'video') return video;
    return processSteps.length > 0 ? processSteps : null;
  }, [uploadMode, image, video, processSteps]);

  const uploadComplete =
    (uploadMode === 'single' && !!image) ||
    (uploadMode === 'video' && !!video) ||
    (uploadMode === 'flow' && processSteps.length > 0);
  const scenarioComplete = !!scenario.businessGoal.trim() || !!scenario.keyTasks.trim();
  const frameworkComplete = !!selectedFramework;
  const personaComplete = selectedPersonaIds.length > 0;

  const completionList = [
    { label: STEP_TITLES[0], done: uploadComplete },
    { label: STEP_TITLES[1], done: scenarioComplete },
    { label: STEP_TITLES[2], done: frameworkComplete },
    { label: STEP_TITLES[3], done: personaComplete }
  ];
  const completionPercent = Math.round((completionList.filter((item) => item.done).length / completionList.length) * 100);

  const missingGuidance = useMemo(() => {
    const missing = [];
    if (!uploadComplete) missing.push('上传素材');
    if (!scenarioComplete) missing.push('填写评测目标或关键任务');
    if (!frameworkComplete) missing.push('选择评测体系');
    if (!personaComplete) missing.push('选择至少一个角色');
    return missing;
  }, [frameworkComplete, personaComplete, scenarioComplete, uploadComplete]);

  const canAnalyze = uploadComplete && scenarioComplete && frameworkComplete && personaComplete && activeStep === 4;
  const hasMultipleReports = Object.keys(reports).length > 1;
  const currentReport = reports[viewingPersonaId];

  const getFrameworkForReport = (report: FrameworkReport) =>
    frameworks.find((framework) => framework.id === report.frameworkId) || FRAMEWORK_PRESETS[0];

  const goToNextStep = () => {
    setActiveStep((previous) => {
      if (previous === 1 && uploadComplete) return 2;
      if (previous === 2 && scenarioComplete) return 3;
      if (previous === 3 && frameworkComplete) return 4;
      return previous;
    });
  };

  const resetAnalysisResult = () => {
    setReports({});
    setOptimizedImages({});
    setError(null);
    setShowSummary(false);
  };

  const clearForMode = (mode: UploadMode) => {
    setUploadMode(mode);
    setImage(null);
    setVideo(null);
    setProcessSteps([]);
    setSingleFileName('');
    setVideoFileName('');
    resetAnalysisResult();
  };

  const extractFiles = (fileList: FileList | null): File[] =>
    fileList ? (Array.from(fileList) as File[]) : [];

  const loadImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
      setVideo(null);
      setProcessSteps([]);
      setSingleFileName(file.name);
      setVideoFileName('');
      resetAnalysisResult();
    };
    reader.readAsDataURL(file);
  };

  const loadVideoFile = (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      alert('视频大于 50MB，请压缩后再上传。');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setVideo(reader.result as string);
      setImage(null);
      setProcessSteps([]);
      setVideoFileName(file.name);
      setSingleFileName('');
      resetAnalysisResult();
    };
    reader.readAsDataURL(file);
  };

  const loadFlowFiles = (files: File[]) => {
    if (files.length === 0) return;
    setImage(null);
    setVideo(null);
    setSingleFileName('');
    setVideoFileName('');
    setProcessSteps([]);
    resetAnalysisResult();

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProcessSteps((previous) => [
          ...previous,
          {
            id: `${Date.now()}-${Math.random()}`,
            image: reader.result as string,
            description: '',
            fileName: file.name
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleInputFiles = (files: File[]) => {
    if (!files.length) return;
    if (uploadMode === 'single') {
      loadImageFile(files[0]);
      return;
    }
    if (uploadMode === 'video') {
      loadVideoFile(files[0]);
      return;
    }
    loadFlowFiles(files.filter((file) => file.type.startsWith('image/')));
  };

  const updateFlowStepDescription = (id: string, description: string) => {
    setProcessSteps((previous) =>
      previous.map((step) => (step.id === id ? { ...step, description } : step))
    );
  };

  const removeFlowStep = (id: string) => {
    setProcessSteps((previous) => previous.filter((step) => step.id !== id));
  };

  const handleDropUpload: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setIsDropActive(false);
    const files = extractFiles(event.dataTransfer.files);
    handleInputFiles(files);
  };

  const togglePersona = (personaId: string) => {
    setSelectedPersonaIds((previous) => {
      if (previous.includes(personaId)) {
        if (previous.length === 1) return previous;
        return previous.filter((id) => id !== personaId);
      }
      return [...previous, personaId];
    });
  };

  const savePersonaDraft = () => {
    if (!personaDraft.name.trim()) return;
    const id = `persona-${Date.now()}`;
    setPersonas((previous) => [...previous, { ...personaDraft, id }]);
    setSelectedPersonaIds((previous) => [...new Set([...previous, id])]);
    setPersonaDraft(EMPTY_PERSONA);
    setShowPersonaForm(false);
  };

  const createPersonaFromRecommendation = (draft: Omit<Persona, 'id'>) => {
    const id = `persona-${Date.now()}`;
    setPersonas((previous) => [...previous, { ...draft, id }]);
    setSelectedPersonaIds((previous) => [...new Set([...previous, id])]);
  };

  const exportPersona = (persona: Persona) => {
    const { id, ...payload } = persona;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    saveFile(blob, `persona_${persona.name}.json`);
  };

  const exportSetupConfig = () => {
    const payload = {
      uploadMode,
      selectedFrameworkId,
      selectedPersonaIds,
      scenario,
      sourceMeta: {
        singleFileName,
        videoFileName,
        flowStepCount: processSteps.length,
        flowStepNames: processSteps.map((step) => step.fileName || '未命名')
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    saveFile(blob, 'ux_evaluation_config.json');
  };

  const importPersona = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const parsed = JSON.parse(loadEvent.target?.result as string) as Omit<Persona, 'id'>;
        if (!parsed.name || !parsed.role || !parsed.attributes) throw new Error('角色文件缺少必要字段');
        const id = `persona-${Date.now()}`;
        setPersonas((previous) => [...previous, { ...parsed, id }]);
        setSelectedPersonaIds((previous) => [...new Set([...previous, id])]);
      } catch (err) {
        alert(err instanceof Error ? err.message : '角色导入失败');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const importFramework = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const result = parseFrameworkJson((loadEvent.target?.result as string) || '');
      if (result.ok === false) {
        alert(result.error);
      } else {
        setFrameworks((previous) => {
          const withoutDuplicate = previous.filter((item) => item.id !== result.framework.id);
          return [...withoutDuplicate, result.framework];
        });
        setSelectedFrameworkId(result.framework.id);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const downloadFrameworkTemplate = () => {
    const blob = new Blob([JSON.stringify(CUSTOM_FRAMEWORK_TEMPLATE, null, 2)], {
      type: 'application/json'
    });
    saveFile(blob, 'framework_template.json');
  };

  const inferScenario = async () => {
    if (!currentInput) return;
    setIsInferringScenario(true);
    setError(null);
    try {
      const inferred = await inferScenarioFromInput(currentInput, apiConfig);
      setScenario((previous) => ({
        ...previous,
        ...inferred,
        source: previous.businessGoal || previous.keyTasks ? 'mixed' : 'ai_inferred'
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '场景提炼失败');
    } finally {
      setIsInferringScenario(false);
    }
  };

  const fetchPersonaRecommendations = async () => {
    if (!currentInput || !selectedFramework) return;
    setIsRecommending(true);
    setError(null);
    try {
      const recommendations = await recommendPersonas({
        input: currentInput,
        framework: selectedFramework,
        scenario,
        existingPersonas: personas,
        apiConfig
      });
      setPersonaRecommendations(recommendations);
    } catch (err) {
      setError(err instanceof Error ? err.message : '角色推荐失败');
    } finally {
      setIsRecommending(false);
    }
  };

  const analyze = async () => {
    if (!currentInput || !selectedFramework || selectedPersonas.length === 0) return;
    if (apiConfig.provider === 'google') {
      try {
        if (window.aistudio) {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          if (!hasKey) await window.aistudio.openSelectKey();
        }
      } catch (keyError) {
        console.warn('API key check failed', keyError);
      }
    }

    setIsAnalyzing(true);
    setShowSummary(false);
    setViewingPersonaId(selectedPersonas[0].id);
    setError(null);
    setReports({});

    try {
      const resultEntries = await Promise.all(
        selectedPersonas.map(async (persona) => {
          const report = await analyzeDesign(currentInput, persona, selectedFramework, apiConfig, scenario);
          return { personaId: persona.id, report };
        })
      );
      const nextReports: Record<string, FrameworkReport> = {};
      resultEntries.forEach((entry) => {
        nextReports[entry.personaId] = entry.report;
      });
      setReports(nextReports);

      if (shouldGenerateImages && uploadMode !== 'video') {
        const sourceImage = uploadMode === 'single' ? image : processSteps[0]?.image;
        if (sourceImage) {
          setIsGeneratingImage(true);
          const generatedList = await Promise.all(
            selectedPersonas.map(async (persona) => {
              try {
                const generated = await generateOptimizedDesign(
                  sourceImage,
                  persona,
                  nextReports[persona.id],
                  apiConfig
                );
                return { personaId: persona.id, image: generated };
              } catch (err) {
                console.error('generate image failed', err);
                return null;
              }
            })
          );
          const generatedMap: Record<string, string> = {};
          generatedList.forEach((entry) => {
            if (entry) generatedMap[entry.personaId] = entry.image;
          });
          setOptimizedImages(generatedMap);
        }
      }

      setPageMode('report');
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败');
    } finally {
      setIsAnalyzing(false);
      setIsGeneratingImage(false);
    }
  };

  const generatePngBlob = async (node: HTMLElement): Promise<Blob | null> => {
    const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff' });
    const response = await fetch(dataUrl);
    return response.blob();
  };

  const exportCurrentReport = async () => {
    const targetNode = showSummary ? summaryCaptureRef.current : reportCaptureRef.current;
    if (!targetNode) return;
    setIsExporting(true);
    try {
      const blob = await generatePngBlob(targetNode);
      if (blob) {
        const filename = showSummary ? 'summary' : viewingPersonaId;
        saveFile(blob, `ux_report_${filename}.png`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  const exportBatchReports = async () => {
    const reportIds = Object.keys(reports);
    if (!reportIds.length) return;
    setIsBatchExporting(true);
    try {
      const zip = new JSZip();
      for (const id of reportIds) {
        const node = document.getElementById(`capture-${id}`);
        if (!node) continue;
        const blob = await generatePngBlob(node);
        if (blob) {
          const name = personas.find((persona) => persona.id === id)?.name || id;
          zip.file(`report_${name}.png`, blob);
        }
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveFile(zipBlob as Blob, 'ux_reports.zip');
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量导出失败');
    } finally {
      setIsBatchExporting(false);
    }
  };

  const uploadMainLabel =
    uploadMode === 'single'
      ? '上传单页截图'
      : uploadMode === 'flow'
      ? '上传流程步骤截图（可多选）'
      : '上传评测录屏（mp4/webm/mov）';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {pageMode === 'setup' ? (
        <div className="mx-auto max-w-4xl p-4 md:p-6 pb-28 space-y-4">
          <header className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <h1 className="text-xl font-semibold">AI 用户体验评测</h1>
            <p className="text-sm text-slate-600">
              先完成配置，再进入报告。你将按照 4 个步骤完成一次评测，当前完成度 {completionPercent}%。
            </p>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-slate-700" style={{ width: `${completionPercent}%` }} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {completionList.map((item, index) => (
                <button
                  key={item.label}
                  onClick={() => setActiveStep((index + 1) as SetupStep)}
                  className={`rounded-lg border px-2 py-1.5 text-left ${
                    activeStep === index + 1
                      ? 'border-slate-400 bg-slate-100'
                      : item.done
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div>步骤 {index + 1}</div>
                  <div className="font-medium mt-0.5">{item.label}</div>
                </button>
              ))}
            </div>
          </header>

          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

          <section className={`rounded-xl border bg-white p-4 space-y-3 ${activeStep === 1 ? 'border-slate-400' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">步骤 1：{STEP_TITLES[0]}</h2>
              <button onClick={() => clearForMode(uploadMode)} className="text-xs text-slate-500 underline">
                清空素材
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm">
              {(['single', 'flow', 'video'] as UploadMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => clearForMode(mode)}
                  className={`rounded-lg border px-3 py-2 ${
                    uploadMode === mode ? 'border-slate-400 bg-slate-100' : 'border-slate-200'
                  }`}
                >
                  {mode === 'single' ? '单页截图' : mode === 'flow' ? '流程截图' : '视频录屏'}
                </button>
              ))}
            </div>

            <div
              onDrop={handleDropUpload}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDropActive(true);
              }}
              onDragLeave={() => setIsDropActive(false)}
              className={`rounded-lg border-2 border-dashed p-6 text-center ${
                isDropActive ? 'border-slate-500 bg-slate-50' : 'border-slate-300 bg-white'
              }`}
            >
              <p className="text-sm font-medium">{uploadMainLabel}</p>
              <p className="text-xs text-slate-500 mt-1">支持拖拽文件到此区域，或点击按钮选择文件</p>
              {uploadMode === 'single' && (
                <>
                  <button onClick={() => imageInputRef.current?.click()} className="mt-3 rounded-lg border px-4 py-2 text-sm">
                    选择图片
                  </button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleInputFiles(extractFiles(event.target.files))}
                    className="hidden"
                  />
                </>
              )}
              {uploadMode === 'video' && (
                <>
                  <button onClick={() => videoInputRef.current?.click()} className="mt-3 rounded-lg border px-4 py-2 text-sm">
                    选择视频
                  </button>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={(event) => handleInputFiles(extractFiles(event.target.files))}
                    className="hidden"
                  />
                </>
              )}
              {uploadMode === 'flow' && (
                <>
                  <button onClick={() => flowInputRef.current?.click()} className="mt-3 rounded-lg border px-4 py-2 text-sm">
                    选择流程图片
                  </button>
                  <input
                    ref={flowInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(event) => handleInputFiles(extractFiles(event.target.files))}
                    className="hidden"
                  />
                </>
              )}
            </div>

            {uploadMode === 'single' && image && (
              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <p className="text-xs text-slate-500">已上传：{singleFileName || '图片文件'}</p>
                <img src={image} alt="单页截图" className="max-h-56 rounded-md" />
              </div>
            )}
            {uploadMode === 'video' && video && (
              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <p className="text-xs text-slate-500">已上传：{videoFileName || '视频文件'}</p>
                <video src={video} controls className="max-h-56 rounded-md" />
              </div>
            )}
            {uploadMode === 'flow' && processSteps.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <p className="text-xs text-slate-500">已上传：{processSteps.length} 张流程图</p>
                {processSteps.map((step, index) => (
                  <div key={step.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2 space-y-2">
                    <p className="text-xs text-slate-500">
                      步骤 {index + 1} {step.fileName ? `· ${step.fileName}` : ''}
                    </p>
                    <img src={step.image} alt={`步骤${index + 1}`} className="max-h-28 rounded-md" />
                    <textarea
                      value={step.description}
                      onChange={(event) => updateFlowStepDescription(step.id, event.target.value)}
                      placeholder="补充步骤描述（可选）"
                      rows={2}
                      className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                    />
                    <button onClick={() => removeFlowStep(step.id)} className="text-xs text-rose-600 underline">
                      删除此步骤
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {activeStep >= 2 && (
            <section className={`rounded-xl border bg-white p-4 ${activeStep === 2 ? 'border-slate-400' : 'border-slate-200'}`}>
              <h2 className="text-base font-semibold mb-3">步骤 2：{STEP_TITLES[1]}</h2>
              <ScenarioEditor
                scenario={scenario}
                onChange={setScenario}
                onInfer={inferScenario}
                isInferring={isInferringScenario}
                canInfer={!!currentInput}
              />
            </section>
          )}

          {activeStep >= 3 && (
            <section className={`rounded-xl border bg-white p-4 space-y-3 ${activeStep === 3 ? 'border-slate-400' : 'border-slate-200'}`}>
              <h2 className="text-base font-semibold">步骤 3：{STEP_TITLES[2]}</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <select
                  value={selectedFrameworkId}
                  onChange={(event) => setSelectedFrameworkId(event.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="">请选择评测体系</option>
                  {frameworks.map((framework) => (
                    <option key={framework.id} value={framework.id}>
                      {framework.name}（{framework.source === 'builtin' ? '内置' : '自定义'}）
                    </option>
                  ))}
                </select>
                <select
                  value={apiConfig.provider}
                  onChange={(event) =>
                    setApiConfig((previous) => ({
                      ...previous,
                      provider: event.target.value as ApiConfig['provider']
                    }))
                  }
                  className="rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="google">Google</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
                {apiConfig.provider === 'openrouter' ? (
                  <select
                    value={apiConfig.openRouterModel}
                    onChange={(event) =>
                      setApiConfig((previous) => ({
                        ...previous,
                        openRouterModel: event.target.value
                      }))
                    }
                    className="rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {OPENROUTER_TEXT_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={apiConfig.imageModel}
                    onChange={(event) =>
                      setApiConfig((previous) => ({
                        ...previous,
                        imageModel: event.target.value
                      }))
                    }
                    className="rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {GOOGLE_IMAGE_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {selectedFramework ? selectedFramework.description : '请选择一个评测体系，系统将按该体系生成报告。'}
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <button onClick={downloadFrameworkTemplate} className="rounded-lg border border-slate-200 px-3 py-2">
                  下载体系模板
                </button>
                <button onClick={() => frameworkImportRef.current?.click()} className="rounded-lg border border-slate-200 px-3 py-2">
                  导入体系 JSON
                </button>
                <input
                  ref={frameworkImportRef}
                  type="file"
                  accept=".json"
                  onChange={importFramework}
                  className="hidden"
                />
              </div>
            </section>
          )}

          {activeStep >= 4 && (
            <section className={`rounded-xl border bg-white p-4 space-y-3 ${activeStep === 4 ? 'border-slate-400' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">步骤 4：{STEP_TITLES[3]}</h2>
                <div className="flex gap-2">
                  <button onClick={() => personaImportRef.current?.click()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                    导入角色
                  </button>
                  <input
                    ref={personaImportRef}
                    type="file"
                    accept=".json"
                    onChange={importPersona}
                    className="hidden"
                  />
                  <button
                    onClick={() => setShowPersonaForm((previous) => !previous)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
                  >
                    新建角色
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {personas.map((persona) => (
                  <label key={persona.id} className="block rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selectedPersonaIds.includes(persona.id)}
                          onChange={() => togglePersona(persona.id)}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium">{persona.name}</p>
                          <p className="text-xs text-slate-500">{persona.description}</p>
                        </div>
                      </div>
                      <button onClick={() => exportPersona(persona)} className="text-xs text-slate-500 underline">
                        导出
                      </button>
                    </div>
                  </label>
                ))}
              </div>

              {showPersonaForm && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <input
                    value={personaDraft.name}
                    onChange={(event) => setPersonaDraft((previous) => ({ ...previous, name: event.target.value }))}
                    placeholder="角色名称"
                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={personaDraft.description}
                    onChange={(event) =>
                      setPersonaDraft((previous) => ({ ...previous, description: event.target.value }))
                    }
                    placeholder="角色描述"
                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  <select
                    value={personaDraft.role}
                    onChange={(event) =>
                      setPersonaDraft((previous) => ({ ...previous, role: event.target.value as UserRole }))
                    }
                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  >
                    <option value={UserRole.USER}>普通用户</option>
                    <option value={UserRole.EXPERT}>专家评审</option>
                  </select>
                  <button onClick={savePersonaDraft} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">
                    保存角色
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={fetchPersonaRecommendations}
                  disabled={!currentInput || isRecommending}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-50"
                >
                  {isRecommending ? '推荐中...' : 'AI 推荐角色'}
                </button>
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  <input
                    type="checkbox"
                    checked={shouldGenerateImages}
                    onChange={() => setShouldGenerateImages((previous) => !previous)}
                    disabled={uploadMode === 'video'}
                  />
                  生成优化效果图（视频模式关闭）
                </label>
              </div>

              <PersonaRecommendations
                recommendations={personaRecommendations}
                personas={personas}
                onAddExisting={(personaId) =>
                  setSelectedPersonaIds((previous) => [...new Set([...previous, personaId])])
                }
                onCreateFromDraft={createPersonaFromRecommendation}
              />
            </section>
          )}

          <div className="sticky bottom-3 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="text-sm">
              {missingGuidance.length > 0 ? (
                <p>还需完成：{missingGuidance.join('、')}</p>
              ) : (
                <p>配置已完成，可以开始评测。</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={goToNextStep}
                disabled={activeStep === 4}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-50"
              >
                下一步
              </button>
              <button
                onClick={analyze}
                disabled={!canAnalyze || isAnalyzing}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {isAnalyzing ? '分析中...' : '开始评测'}
              </button>
              <button onClick={exportSetupConfig} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
                导出评测配置
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-4">
          <header className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-semibold">评测报告</h1>
              <p className="text-sm text-slate-500">已完成配置，当前处于报告查看阶段。</p>
            </div>
            <button onClick={() => setPageMode('setup')} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
              返回配置
            </button>
          </header>

          <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {hasMultipleReports && (
                <button
                  onClick={() => setShowSummary(true)}
                  className={`rounded-lg px-3 py-1.5 text-xs ${
                    showSummary ? 'bg-slate-900 text-white' : 'border border-slate-200'
                  }`}
                >
                  综合报告
                </button>
              )}
              {Object.keys(reports).map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    setViewingPersonaId(id);
                    setShowSummary(false);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs ${
                    !showSummary && viewingPersonaId === id ? 'bg-slate-900 text-white' : 'border border-slate-200'
                  }`}
                >
                  {personas.find((persona) => persona.id === id)?.name || id}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportCurrentReport}
                disabled={isExporting || (!showSummary && !currentReport)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50"
              >
                {isExporting ? '导出中...' : '导出当前报告 PNG'}
              </button>
              <button
                onClick={exportBatchReports}
                disabled={isBatchExporting || Object.keys(reports).length === 0}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50"
              >
                {isBatchExporting ? '打包中...' : '导出全部报告 ZIP'}
              </button>
            </div>
          </div>

          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

          {showSummary && hasMultipleReports ? (
            <div ref={summaryCaptureRef} className="rounded-xl border border-slate-200 bg-white p-4">
              <SummaryReport reports={reports} personas={personas} />
            </div>
          ) : currentReport ? (
            <div ref={reportCaptureRef} className="rounded-xl border border-slate-200 bg-white p-4">
              <ReportView
                report={currentReport}
                framework={getFrameworkForReport(currentReport)}
                originalImage={uploadMode === 'video' ? video : image}
                processSteps={uploadMode === 'flow' ? processSteps : undefined}
                optimizedImage={optimizedImages[viewingPersonaId]}
                isGeneratingImage={isGeneratingImage}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              当前没有可展示的报告，请返回配置并执行评测。
            </div>
          )}
        </div>
      )}

      {Object.keys(reports).length > 0 && (
        <div className="fixed left-[-99999px] top-0 opacity-0 pointer-events-none">
          {(Object.entries(reports) as Array<[string, FrameworkReport]>).map(([id, report]) => (
            <div key={id} id={`capture-${id}`} className="w-[1200px] p-6 bg-white">
              <ReportView
                report={report}
                framework={getFrameworkForReport(report)}
                originalImage={uploadMode === 'video' ? video : image}
                processSteps={uploadMode === 'flow' ? processSteps : undefined}
                optimizedImage={optimizedImages[id]}
                isGeneratingImage={false}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}