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
import { FRAMEWORK_PRESETS, DEFAULT_FRAMEWORK_ID } from './config/frameworkPresets';
import { CUSTOM_FRAMEWORK_TEMPLATE, parseFrameworkJson } from './utils/frameworkSchema';
import { analyzeDesign, generateOptimizedDesign, inferScenarioFromInput, recommendPersonas } from './services/geminiService';
import { ReportView } from './components/ReportView';
import { SummaryReport } from './components/SummaryReport';
import { ScenarioEditor } from './components/ScenarioEditor';
import { PersonaRecommendations } from './components/PersonaRecommendations';
import { Download, FileJson, FileUp, Loader2, Plus, Sparkles, Users } from 'lucide-react';

const saveFile = (data: Blob | string, filename: string) => {
  const save = (FileSaver as any).saveAs || (FileSaver as any).default || FileSaver;
  if (typeof save === 'function') {
    save(data, filename);
  }
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

export default function App() {
  const [personas, setPersonas] = useState<Persona[]>(DEFAULT_PERSONAS);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([DEFAULT_PERSONAS[0].id]);
  const [personaDraft, setPersonaDraft] = useState<Omit<Persona, 'id'>>(EMPTY_PERSONA);
  const [showPersonaForm, setShowPersonaForm] = useState(false);
  const [personaRecommendations, setPersonaRecommendations] = useState<PersonaRecommendation[]>([]);

  const [frameworks, setFrameworks] = useState<EvaluationFramework[]>(FRAMEWORK_PRESETS);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState(DEFAULT_FRAMEWORK_ID);

  const [uploadMode, setUploadMode] = useState<'single' | 'flow' | 'video'>('single');
  const [image, setImage] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>([]);

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
    () => frameworks.find((framework) => framework.id === selectedFrameworkId) || FRAMEWORK_PRESETS[0],
    [frameworks, selectedFrameworkId]
  );
  const selectedPersonas = useMemo(
    () => personas.filter((persona) => selectedPersonaIds.includes(persona.id)),
    [personas, selectedPersonaIds]
  );

  const currentInput = useMemo(() => {
    if (uploadMode === 'single') return image;
    if (uploadMode === 'video') return video;
    return processSteps.length ? processSteps : null;
  }, [uploadMode, image, video, processSteps]);

  const getFrameworkForReport = (report: FrameworkReport) =>
    frameworks.find((framework) => framework.id === report.frameworkId) || selectedFramework;

  const canAnalyze =
    !!currentInput &&
    selectedPersonaIds.length > 0 &&
    (!!scenario.businessGoal.trim() || !!scenario.keyTasks.trim());

  const hasMultipleReports = Object.keys(reports).length > 1;
  const currentReport = reports[viewingPersonaId];

  const resetAnalysisResult = () => {
    setReports({});
    setOptimizedImages({});
    setPersonaRecommendations([]);
    setError(null);
  };

  const handleSingleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadMode('single');
      setImage(reader.result as string);
      setVideo(null);
      setProcessSteps([]);
      resetAnalysisResult();
    };
    reader.readAsDataURL(file);
  };

  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      alert('视频大于 50MB，请压缩后再上传。');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadMode('video');
      setVideo(reader.result as string);
      setImage(null);
      setProcessSteps([]);
      resetAnalysisResult();
    };
    reader.readAsDataURL(file);
  };

  const handleFlowUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = event.target.files ? Array.from(event.target.files) : [];
    if (!files.length) return;
    setUploadMode('flow');
    setImage(null);
    setVideo(null);
    resetAnalysisResult();

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProcessSteps((previous) => [
          ...previous,
          {
            id: `${Date.now()}-${Math.random()}`,
            image: reader.result as string,
            description: ''
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const updateFlowStepDescription = (id: string, description: string) => {
    setProcessSteps((previous) =>
      previous.map((step) => (step.id === id ? { ...step, description } : step))
    );
  };

  const removeFlowStep = (id: string) => {
    setProcessSteps((previous) => previous.filter((step) => step.id !== id));
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
    setSelectedPersonaIds((previous) => [...previous, id]);
    setPersonaDraft(EMPTY_PERSONA);
    setShowPersonaForm(false);
  };

  const exportPersona = (persona: Persona) => {
    const { id, ...payload } = persona;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    saveFile(blob, `persona_${persona.name}.json`);
  };

  const importPersona = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const parsed = JSON.parse(loadEvent.target?.result as string) as Omit<Persona, 'id'>;
        if (!parsed.name || !parsed.role || !parsed.attributes) {
          throw new Error('缺少必要字段');
        }
        const id = `persona-${Date.now()}`;
        setPersonas((previous) => [...previous, { ...parsed, id }]);
        setSelectedPersonaIds((previous) => [...previous, id]);
      } catch (parseError) {
        alert(parseError instanceof Error ? parseError.message : '角色 JSON 解析失败');
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
        source:
          previous.businessGoal || previous.keyTasks || previous.painPoints
            ? 'mixed'
            : 'ai_inferred'
      }));
    } catch (inferError) {
      setError(inferError instanceof Error ? inferError.message : '场景提炼失败');
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
    } catch (recommendError) {
      setError(recommendError instanceof Error ? recommendError.message : '角色推荐失败');
    } finally {
      setIsRecommending(false);
    }
  };

  const createPersonaFromRecommendation = (draft: Omit<Persona, 'id'>) => {
    const id = `persona-${Date.now()}`;
    setPersonas((previous) => [...previous, { ...draft, id }]);
    setSelectedPersonaIds((previous) => [...new Set([...previous, id])]);
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
          const optimized = await Promise.all(
            selectedPersonas.map(async (persona) => {
              const report = nextReports[persona.id];
              try {
                const generated = await generateOptimizedDesign(sourceImage, persona, report, apiConfig);
                return { personaId: persona.id, image: generated };
              } catch (imageError) {
                console.error('image generation failed', imageError);
                return null;
              }
            })
          );
          const imageMap: Record<string, string> = {};
          optimized.forEach((entry) => {
            if (entry) imageMap[entry.personaId] = entry.image;
          });
          setOptimizedImages(imageMap);
        }
      }
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : '分析失败');
    } finally {
      setIsAnalyzing(false);
      setIsGeneratingImage(false);
    }
  };

  const generatePngBlob = async (node: HTMLElement): Promise<Blob | null> => {
    const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2, backgroundColor: '#F8FAFC' });
    const response = await fetch(dataUrl);
    return response.blob();
  };

  const exportCurrent = async () => {
    const targetNode = showSummary ? summaryCaptureRef.current : reportCaptureRef.current;
    if (!targetNode) return;
    setIsExporting(true);
    try {
      const blob = await generatePngBlob(targetNode);
      if (blob) {
        const name = showSummary ? 'summary' : viewingPersonaId;
        saveFile(blob, `ux_framework_report_${name}.png`);
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  const exportBatch = async () => {
    const ids = Object.keys(reports);
    if (!ids.length) return;
    setIsBatchExporting(true);
    try {
      const zip = new JSZip();
      for (const personaId of ids) {
        const node = document.getElementById(`capture-${personaId}`);
        if (!node) continue;
        const blob = await generatePngBlob(node);
        if (blob) {
          const personaName = personas.find((persona) => persona.id === personaId)?.name || personaId;
          zip.file(`report_${personaName}.png`, blob);
        }
      }
      const zipContent = await zip.generateAsync({ type: 'blob' });
      saveFile(zipContent as Blob, 'ux_framework_reports.zip');
    } catch (zipError) {
      setError(zipError instanceof Error ? zipError.message : '批量导出失败');
    } finally {
      setIsBatchExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-xl font-bold">AI 用户体验评测框架</h1>
            <p className="text-xs text-slate-500 mt-1">
              可插拔评测体系（ETS / HEART / SUS-Lite / UEQ-Lite / 自定义）+ AI 场景提炼 + AI 角色推荐
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={apiConfig.provider}
              onChange={(event) =>
                setApiConfig((previous) => ({ ...previous, provider: event.target.value as ApiConfig['provider'] }))
              }
              className="rounded-lg border border-slate-200 px-2 py-1.5"
            >
              <option value="google">Google GenAI</option>
              <option value="openrouter">OpenRouter</option>
            </select>
            {apiConfig.provider === 'openrouter' && (
              <select
                value={apiConfig.openRouterModel}
                onChange={(event) =>
                  setApiConfig((previous) => ({ ...previous, openRouterModel: event.target.value }))
                }
                className="rounded-lg border border-slate-200 px-2 py-1.5"
              >
                {OPENROUTER_TEXT_MODELS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            )}
            <select
              value={apiConfig.imageModel}
              onChange={(event) => setApiConfig((previous) => ({ ...previous, imageModel: event.target.value }))}
              className="rounded-lg border border-slate-200 px-2 py-1.5"
            >
              {(apiConfig.provider === 'google' ? GOOGLE_IMAGE_MODELS : OPENROUTER_IMAGE_MODELS).map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[440px_minmax(0,1fr)] gap-4">
          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <h2 className="text-sm font-semibold">1) 上传评测素材</h2>

              <div className="grid grid-cols-3 gap-2">
                {(['single', 'flow', 'video'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setUploadMode(mode)}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                      uploadMode === mode
                        ? 'border-violet-300 bg-violet-50 text-violet-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    {mode === 'single' ? '单页截图' : mode === 'flow' ? '流程截图' : '视频录屏'}
                  </button>
                ))}
              </div>

              {uploadMode === 'single' && (
                <div className="space-y-2">
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs"
                  >
                    {image ? '重新上传图片' : '上传图片'}
                  </button>
                  <input ref={imageInputRef} type="file" accept="image/*" onChange={handleSingleImageUpload} className="hidden" />
                  {image && <img src={image} alt="预览图" className="max-h-40 rounded-lg" />}
                </div>
              )}

              {uploadMode === 'video' && (
                <div className="space-y-2">
                  <button
                    onClick={() => videoInputRef.current?.click()}
                    className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs"
                  >
                    {video ? '重新上传视频' : '上传视频（<=50MB）'}
                  </button>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={handleVideoUpload}
                    className="hidden"
                  />
                  {video && <video src={video} controls className="max-h-40 rounded-lg" />}
                </div>
              )}

              {uploadMode === 'flow' && (
                <div className="space-y-2">
                  <button
                    onClick={() => flowInputRef.current?.click()}
                    className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs"
                  >
                    添加流程截图（可多选）
                  </button>
                  <input ref={flowInputRef} type="file" multiple accept="image/*" onChange={handleFlowUpload} className="hidden" />
                  <div className="space-y-2">
                    {processSteps.map((step, index) => (
                      <div key={step.id} className="rounded-lg border border-slate-200 p-2 space-y-2">
                        <img src={step.image} alt={`流程${index + 1}`} className="max-h-28 rounded-md" />
                        <textarea
                          value={step.description}
                          onChange={(event) => updateFlowStepDescription(step.id, event.target.value)}
                          placeholder="填写该步骤动作描述"
                          rows={2}
                          className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                        />
                        <button
                          onClick={() => removeFlowStep(step.id)}
                          className="text-[11px] text-rose-600 font-semibold"
                        >
                          删除此步骤
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <ScenarioEditor
              scenario={scenario}
              onChange={setScenario}
              onInfer={inferScenario}
              isInferring={isInferringScenario}
              canInfer={!!currentInput}
            />

            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <h2 className="text-sm font-semibold">2) 选择评测体系</h2>

              <div className="space-y-2">
                <select
                  value={selectedFrameworkId}
                  onChange={(event) => setSelectedFrameworkId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {frameworks.map((framework) => (
                    <option key={framework.id} value={framework.id}>
                      {framework.name} ({framework.source === 'builtin' ? '内置' : '自定义'})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">{selectedFramework.description}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    onClick={downloadFrameworkTemplate}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                  >
                    <FileJson size={13} />
                    下载体系模板
                  </button>
                  <button
                    onClick={() => frameworkImportRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                  >
                    <FileUp size={13} />
                    导入体系 JSON
                  </button>
                  <input ref={frameworkImportRef} type="file" accept=".json" onChange={importFramework} className="hidden" />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">3) 选择角色</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => personaImportRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                  >
                    <FileUp size={12} />
                    导入
                  </button>
                  <input ref={personaImportRef} type="file" accept=".json" onChange={importPersona} className="hidden" />
                  <button
                    onClick={() => setShowPersonaForm((previous) => !previous)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                  >
                    <Plus size={12} />
                    新角色
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {personas.map((persona) => {
                  const checked = selectedPersonaIds.includes(persona.id);
                  return (
                    <label key={persona.id} className="block rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePersona(persona.id)}
                            className="mt-0.5"
                          />
                          <div>
                            <p className="text-sm font-semibold text-slate-700">{persona.name}</p>
                            <p className="text-xs text-slate-500">{persona.description}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => exportPersona(persona)}
                          className="rounded-md border border-slate-200 bg-white p-1 text-slate-500"
                          title="导出角色"
                        >
                          <Download size={12} />
                        </button>
                      </div>
                    </label>
                  );
                })}
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
                  <button
                    onClick={savePersonaDraft}
                    className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    保存角色
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={fetchPersonaRecommendations}
                  disabled={!currentInput || isRecommending}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                >
                  <Sparkles size={12} />
                  {isRecommending ? '推荐中...' : 'AI 推荐角色'}
                </button>
                <label className="inline-flex items-center gap-1 text-xs text-slate-600">
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

            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
              <button
                onClick={analyze}
                disabled={!canAnalyze || isAnalyzing}
                className="w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isAnalyzing ? '分析中...' : '开始评测'}
              </button>
              <p className="text-[11px] text-slate-500">
                分析条件：已上传素材 + 至少一个角色 + 场景中填写“评测目标”或“关键任务”。
              </p>
            </section>
          </aside>

          <main className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {hasMultipleReports && (
                  <button
                    onClick={() => setShowSummary(true)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      showSummary ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    综合报告
                  </button>
                )}
                {Object.keys(reports).map((personaId) => {
                  const personaName = personas.find((persona) => persona.id === personaId)?.name || personaId;
                  const active = !showSummary && viewingPersonaId === personaId;
                  return (
                    <button
                      key={personaId}
                      onClick={() => {
                        setViewingPersonaId(personaId);
                        setShowSummary(false);
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        active ? 'bg-violet-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <Users size={12} />
                        {personaName}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportCurrent}
                  disabled={isExporting || (!showSummary && !currentReport)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  {isExporting ? '导出中...' : '导出当前 PNG'}
                </button>
                <button
                  onClick={exportBatch}
                  disabled={isBatchExporting || Object.keys(reports).length === 0}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  {isBatchExporting ? '打包中...' : '批量导出 ZIP'}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
            )}

            {isAnalyzing ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
                <Loader2 className="mx-auto animate-spin text-violet-600" />
                <p className="mt-3 text-sm text-slate-600">正在基于所选体系进行多角色并行分析...</p>
              </div>
            ) : showSummary && hasMultipleReports ? (
              <div ref={summaryCaptureRef} className="rounded-2xl border border-slate-200 bg-white p-4">
                <SummaryReport reports={reports} personas={personas} />
              </div>
            ) : currentReport ? (
              <div ref={reportCaptureRef} className="rounded-2xl border border-slate-200 bg-white p-4">
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
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                <p className="font-semibold text-slate-700">等待分析结果</p>
                <p className="text-sm mt-1">
                  上传素材、定义场景、选择体系与角色后，点击“开始评测”生成报告。
                </p>
              </div>
            )}
          </main>
        </div>
      </div>

      <div className="fixed left-[-99999px] top-0 opacity-0 pointer-events-none">
        {(Object.entries(reports) as Array<[string, FrameworkReport]>).map(([personaId, report]) => (
          <div key={personaId} id={`capture-${personaId}`} className="w-[1200px] p-6 bg-white">
            <ReportView
              report={report}
              framework={getFrameworkForReport(report)}
              originalImage={uploadMode === 'video' ? video : image}
              processSteps={uploadMode === 'flow' ? processSteps : undefined}
              optimizedImage={optimizedImages[personaId]}
              isGeneratingImage={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}