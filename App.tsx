import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import JSZip from 'jszip';
import * as FileSaver from 'file-saver';
import {
  ABComparisonReport,
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
import { clearSetupDraft, loadSetupDraft, saveSetupDraft } from './utils/draftStorage';
import { loadPersonas, savePersonas } from './utils/personaStorage';
import {
  analyzeDesign,
  compareABReports,
  extractPersonasFromText,
  generateOptimizedDesign,
  inferScenarioFromInput,
  recommendPersonas,
  testApiConfig
} from './services/geminiService';
import { extractTextFromFile } from './utils/documentTextExtractor';
import {
  clearApiConfigCookie,
  loadApiConfigFromCookie,
  saveApiConfigToCookie
} from './utils/apiConfigStorage';
import { ReportView } from './components/ReportView';
import { SummaryReport } from './components/SummaryReport';
import { ScenarioEditor } from './components/ScenarioEditor';
import { PersonaRecommendations } from './components/PersonaRecommendations';
import { ABReportView } from './components/ABReportView';
import { ABSummaryReport } from './components/ABSummaryReport';
import { LandingPage } from './components/LandingPage';

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
      年龄: '65+',
      科技熟练度: '低',
      领域知识: '新手',
      核心目标: '无障碍完成核心任务',
      使用环境: '家庭环境',
      挫折容忍度: '低',
      设备习惯: '大字号、慢速操作'
    }
  },
  {
    id: 'p-young',
    name: '高效率年轻用户',
    role: UserRole.USER,
    description: '追求高效率、低阻力，偏好快捷路径。',
    attributes: {
      年龄: '22-35',
      科技熟练度: '高',
      领域知识: '中高',
      核心目标: '快速完成任务',
      使用环境: '移动办公',
      挫折容忍度: '中',
      设备习惯: '移动优先、快速滑动'
    }
  },
  {
    id: 'p-expert',
    name: 'UX 专家审计',
    role: UserRole.EXPERT,
    description: '从规范、可用性和一致性审查整体体验。',
    attributes: {
      年龄: '30-45',
      科技熟练度: '高',
      领域知识: '专家',
      核心目标: '识别系统性体验缺陷',
      使用环境: '设计评审环境',
      挫折容忍度: '中',
      设备习惯: '细节审查'
    }
  },
  {
    id: 'p-pm',
    name: '产品经理视角',
    role: UserRole.EXPERT,
    description: '关注业务闭环、转化路径、异常流程覆盖。',
    attributes: {
      年龄: '28-40',
      科技熟练度: '高',
      领域知识: '业务专家',
      核心目标: '验证业务目标是否被体验支撑',
      使用环境: '办公室',
      挫折容忍度: '中',
      设备习惯: '关注流程状态'
    }
  }
];

const EMPTY_PERSONA: Omit<Persona, 'id'> = {
  name: '',
  role: UserRole.USER,
  description: '',
  attributes: {}
};

interface PersonaAttributeRow {
  id: string;
  key: string;
  value: string;
}

const createAttributeRow = (key = '', value = ''): PersonaAttributeRow => ({
  id: `attr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  key,
  value
});

const attributesToRows = (attributes: Record<string, string>): PersonaAttributeRow[] => {
  const entries = Object.entries(attributes || {});
  if (!entries.length) return [createAttributeRow()];
  return entries.map(([key, value]) => createAttributeRow(key, value));
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

const GITHUB_REPO_URL = 'https://github.com/DietCokewithSugar/UES-agent';

const PROVIDER_OPTIONS = [
  { value: 'google', label: 'Google 官方 API' },
  { value: 'openrouter', label: 'OpenRouter（聚合厂商）' }
] as const;

const GOOGLE_TEXT_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash（Google）' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro（Google）' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash（Google）' }
];

const OPENROUTER_TEXT_MODELS = [
  { value: 'openai/gpt-4.1', label: 'GPT-4.1（OpenAI）' },
  { value: 'anthropic/claude-3.7-sonnet', label: 'Claude 3.7 Sonnet（Anthropic）' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash（Google）' },
  { value: 'qwen/qwen2.5-vl-72b-instruct', label: 'Qwen2.5 VL 72B（阿里）' }
];

const GOOGLE_IMAGE_MODELS = [
  { value: 'gemini-2.0-flash-preview-image-generation', label: 'Gemini 2.0 Flash Image（Google）' },
  { value: 'gemini-2.5-flash-image-preview', label: 'Gemini 2.5 Flash Image（Google）' }
];

const OPENROUTER_IMAGE_MODELS = [
  { value: 'openai/gpt-image-1', label: 'GPT Image 1（OpenAI）' },
  { value: 'google/gemini-2.5-flash-image-preview', label: 'Gemini 2.5 Flash Image（Google）' },
  { value: 'qwen/qwen2.5-vl-72b-instruct', label: 'Qwen2.5 VL（阿里）' }
];

const STEP_TITLES = ['上传评测素材', '定义业务场景与目标', '选择评测体系', '选择评测角色'];
const STEP_REQUIRED_ACTIONS: Record<number, string[]> = {
  1: ['选择素材类型（单页/流程/视频）', '上传至少 1 份评测素材'],
  2: ['补齐评测目标、目标用户、关键任务流', '可使用推荐示例多选快速填充'],
  3: ['选择评测体系（评测维度）', '可选：导入自定义体系 JSON'],
  4: ['至少勾选 1 个评测角色', '可使用 AI 推荐或 AI 新建角色']
};

const pickGoogleImageModel = (provider: ApiConfig['provider'], currentImageModel?: string) => {
  const candidateModels = provider === 'openrouter' ? OPENROUTER_IMAGE_MODELS : GOOGLE_IMAGE_MODELS;
  if (!currentImageModel) return candidateModels[0].value;
  if (candidateModels.some((item) => item.value === currentImageModel)) return currentImageModel;
  return candidateModels[0].value;
};
const SCENARIO_REQUIRED_FIELDS: Array<keyof EvaluationScenario> = [
  'businessGoal',
  'targetUsers',
  'keyTasks'
];
const SCENARIO_FIELD_LABELS: Record<keyof EvaluationScenario, string> = {
  industry: '行业',
  productType: '产品类型',
  businessGoal: '评测目标',
  targetUsers: '目标用户',
  keyTasks: '关键任务流',
  painPoints: '用户痛点',
  successCriteria: '成功标准',
  constraints: '约束条件',
  source: '来源'
};
type PageMode = 'landing' | 'setup' | 'report';
type SetupStep = 1 | 2 | 3 | 4;
type UploadMode = 'single' | 'flow' | 'video';
type UploadConfigMode = 'standard' | 'ab_test';

export default function App() {
  const [pageMode, setPageMode] = useState<PageMode>('landing');
  const [activeStep, setActiveStep] = useState<SetupStep>(1);

  const [personas, setPersonas] = useState<Persona[]>(() => loadPersonas(DEFAULT_PERSONAS));
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);
  const [personaDraft, setPersonaDraft] = useState<Omit<Persona, 'id'>>(EMPTY_PERSONA);
  const [personaDraftRows, setPersonaDraftRows] = useState<PersonaAttributeRow[]>([createAttributeRow()]);
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [personaModalMode, setPersonaModalMode] = useState<'create' | 'edit'>('create');
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [personaRecommendations, setPersonaRecommendations] = useState<PersonaRecommendation[]>([]);

  const [frameworks, setFrameworks] = useState<EvaluationFramework[]>(FRAMEWORK_PRESETS);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState('');

  const [uploadConfigMode, setUploadConfigMode] = useState<UploadConfigMode>('standard');
  const [uploadMode, setUploadMode] = useState<UploadMode>('single');
  const [image, setImage] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>([]);
  const [singleFileName, setSingleFileName] = useState('');
  const [videoFileName, setVideoFileName] = useState('');
  const [abUploadModeA, setAbUploadModeA] = useState<UploadMode>('single');
  const [abImageA, setAbImageA] = useState<string | null>(null);
  const [abVideoA, setAbVideoA] = useState<string | null>(null);
  const [abProcessStepsA, setAbProcessStepsA] = useState<ProcessStep[]>([]);
  const [abSingleFileNameA, setAbSingleFileNameA] = useState('');
  const [abVideoFileNameA, setAbVideoFileNameA] = useState('');
  const [abUploadModeB, setAbUploadModeB] = useState<UploadMode>('single');
  const [abImageB, setAbImageB] = useState<string | null>(null);
  const [abVideoB, setAbVideoB] = useState<string | null>(null);
  const [abProcessStepsB, setAbProcessStepsB] = useState<ProcessStep[]>([]);
  const [abSingleFileNameB, setAbSingleFileNameB] = useState('');
  const [abVideoFileNameB, setAbVideoFileNameB] = useState('');
  const [isDropActive, setIsDropActive] = useState(false);

  const [scenario, setScenario] = useState<EvaluationScenario>(EMPTY_SCENARIO);
  const [showAiGuide, setShowAiGuide] = useState(true);
  const [hasStoredDraft, setHasStoredDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [reports, setReports] = useState<Record<string, FrameworkReport>>({});
  const [abComparisons, setAbComparisons] = useState<Record<string, ABComparisonReport>>({});
  const [viewingPersonaId, setViewingPersonaId] = useState<string>(DEFAULT_PERSONAS[0].id);
  const [showSummary, setShowSummary] = useState(false);
  const [showABSummary, setShowABSummary] = useState(true);

  const [isInferringScenario, setIsInferringScenario] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [isRecommendingNewPersona, setIsRecommendingNewPersona] = useState(false);
  const [isExtractingFromDoc, setIsExtractingFromDoc] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [shouldGenerateImages, setShouldGenerateImages] = useState(false);

  const [optimizedImages, setOptimizedImages] = useState<Record<string, string>>({});
  const [docPersonaCandidates, setDocPersonaCandidates] = useState<PersonaRecommendation[]>([]);
  const [selectedDocPersonaCandidateIds, setSelectedDocPersonaCandidateIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    provider: 'google',
    googleModel: GOOGLE_TEXT_MODELS[0].value,
    openRouterModel: OPENROUTER_TEXT_MODELS[0].value,
    imageModel: GOOGLE_IMAGE_MODELS[0].value,
    googleApiKey: '',
    openRouterApiKey: ''
  });
  const [apiConfigStatus, setApiConfigStatus] = useState<string | null>(null);
  const [isTestingApiConfig, setIsTestingApiConfig] = useState(false);
  const [isApiConfigPanelOpen, setIsApiConfigPanelOpen] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const flowInputRef = useRef<HTMLInputElement>(null);
  const abImageInputRefA = useRef<HTMLInputElement>(null);
  const abVideoInputRefA = useRef<HTMLInputElement>(null);
  const abFlowInputRefA = useRef<HTMLInputElement>(null);
  const abImageInputRefB = useRef<HTMLInputElement>(null);
  const abVideoInputRefB = useRef<HTMLInputElement>(null);
  const abFlowInputRefB = useRef<HTMLInputElement>(null);
  const personaImportRef = useRef<HTMLInputElement>(null);
  const personaExtractRef = useRef<HTMLInputElement>(null);
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

  const currentInputA = useMemo(() => {
    if (abUploadModeA === 'single') return abImageA;
    if (abUploadModeA === 'video') return abVideoA;
    return abProcessStepsA.length > 0 ? abProcessStepsA : null;
  }, [abUploadModeA, abImageA, abVideoA, abProcessStepsA]);

  const currentInputB = useMemo(() => {
    if (abUploadModeB === 'single') return abImageB;
    if (abUploadModeB === 'video') return abVideoB;
    return abProcessStepsB.length > 0 ? abProcessStepsB : null;
  }, [abUploadModeB, abImageB, abVideoB, abProcessStepsB]);

  const standardUploadComplete =
    (uploadMode === 'single' && !!image) ||
    (uploadMode === 'video' && !!video) ||
    (uploadMode === 'flow' && processSteps.length > 0);
  const abUploadComplete = !!currentInputA && !!currentInputB;
  const uploadComplete = uploadConfigMode === 'standard' ? standardUploadComplete : abUploadComplete;
  const abComparableWeak = uploadConfigMode === 'ab_test' && abUploadModeA !== abUploadModeB;
  const currentSetupInput = uploadConfigMode === 'standard' ? currentInput : currentInputA || currentInputB;
  const scenarioComplete = SCENARIO_REQUIRED_FIELDS.every((field) => scenario[field].trim());
  const missingScenarioFields = SCENARIO_REQUIRED_FIELDS.filter((field) => !scenario[field].trim());
  const frameworkComplete = !!selectedFramework;
  const personaComplete = selectedPersonaIds.length > 0;
  const scenarioHasAnyInput = useMemo(
    () =>
      (Object.entries(scenario) as Array<[keyof EvaluationScenario, string]>).some(
        ([key, value]) => key !== 'source' && value.trim()
      ),
    [scenario]
  );
  const hasMeaningfulSetup = uploadComplete || scenarioHasAnyInput || frameworkComplete || personaComplete;

  const completionList: Array<{ id: string; label: string; done: boolean; detail?: string }> = [
    { id: 'step-1', label: STEP_TITLES[0], done: uploadComplete },
    {
      id: 'step-2',
      label: STEP_TITLES[1],
      done: scenarioComplete,
      detail: missingScenarioFields.length
        ? `待补充：${missingScenarioFields.map((field) => SCENARIO_FIELD_LABELS[field]).join('、')}`
        : '关键字段已完成'
    },
    {
      id: 'step-3',
      label: STEP_TITLES[2],
      done: frameworkComplete,
      detail: frameworkComplete ? selectedFramework?.name : '请选择评测体系'
    },
    {
      id: 'step-4',
      label: STEP_TITLES[3],
      done: personaComplete,
      detail: personaComplete ? `已选择 ${selectedPersonaIds.length} 个角色` : '请选择至少 1 个角色'
    }
  ];
  completionList[0].detail = uploadComplete
    ? uploadConfigMode === 'standard'
      ? uploadMode === 'single'
        ? singleFileName || '已上传单页截图'
        : uploadMode === 'video'
        ? videoFileName || '已上传视频'
        : `已上传 ${processSteps.length} 张流程图`
      : `A：${
          abUploadModeA === 'single'
            ? abSingleFileNameA || (abImageA ? '单页截图' : '未上传')
            : abUploadModeA === 'video'
            ? abVideoFileNameA || (abVideoA ? '视频素材' : '未上传')
            : `${abProcessStepsA.length} 张流程图`
        }；B：${
          abUploadModeB === 'single'
            ? abSingleFileNameB || (abImageB ? '单页截图' : '未上传')
            : abUploadModeB === 'video'
            ? abVideoFileNameB || (abVideoB ? '视频素材' : '未上传')
            : `${abProcessStepsB.length} 张流程图`
        }`
    : '请先上传素材';

  const missingGuidance = useMemo(() => {
    const missing: string[] = [];
    if (!uploadComplete) missing.push('上传素材');
    if (uploadConfigMode === 'ab_test' && abComparableWeak) missing.push('A/B 素材类型不一致（可比性较弱）');
    if (!scenarioComplete) {
      missing.push(
        `完善业务场景（缺少：${missingScenarioFields.map((field) => SCENARIO_FIELD_LABELS[field]).join('、')}）`
      );
    }
    if (!frameworkComplete) missing.push('选择评测体系');
    if (!personaComplete) missing.push('选择至少一个角色');
    return missing;
  }, [
    abComparableWeak,
    frameworkComplete,
    missingScenarioFields,
    personaComplete,
    scenarioComplete,
    uploadComplete,
    uploadConfigMode
  ]);

  const canAnalyze = uploadComplete && scenarioComplete && frameworkComplete && personaComplete && activeStep === 4;
  const canExportSetupConfig = hasMeaningfulSetup;
  const canGoNext =
    (activeStep === 1 && uploadComplete) ||
    (activeStep === 2 && scenarioComplete) ||
    (activeStep === 3 && frameworkComplete);
  const stageStatuses = useMemo(() => {
    return completionList.map((item, index) => {
      const stepNumber = index + 1;
      if (item.done && stepNumber !== activeStep) return 'completed' as const;
      if (stepNumber === activeStep) return 'current' as const;
      return 'pending' as const;
    });
  }, [activeStep, completionList]);
  const timelineProgressPercent = Math.round(
    ((stageStatuses.filter((status) => status === 'completed').length +
      (stageStatuses.includes('current') ? 0.5 : 0)) /
      completionList.length) *
      100
  );
  const currentStageTitle = `步骤 ${activeStep} · ${STEP_TITLES[activeStep - 1]}`;
  const currentRequiredActions = STEP_REQUIRED_ACTIONS[activeStep] || [];

  const hasMultipleReports =
    uploadConfigMode === 'ab_test'
      ? Object.keys(abComparisons).length > 1
      : Object.keys(reports).length > 1;
  const currentReport = reports[viewingPersonaId];
  const currentABComparison = abComparisons[viewingPersonaId];

  const getFrameworkForReport = (report: FrameworkReport) =>
    frameworks.find((framework) => framework.id === report.frameworkId) || FRAMEWORK_PRESETS[0];

  const isApiReadyForProvider = useMemo(() => {
    if (apiConfig.provider === 'google') {
      return Boolean(apiConfig.googleApiKey?.trim() && apiConfig.googleModel?.trim());
    }
    return Boolean(apiConfig.openRouterApiKey?.trim() && apiConfig.openRouterModel?.trim());
  }, [apiConfig]);

  const currentTextModel =
    apiConfig.provider === 'google'
      ? apiConfig.googleModel || GOOGLE_TEXT_MODELS[0].value
      : apiConfig.openRouterModel || OPENROUTER_TEXT_MODELS[0].value;
  const currentImageModel =
    apiConfig.imageModel ||
    (apiConfig.provider === 'google'
      ? GOOGLE_IMAGE_MODELS[0].value
      : OPENROUTER_IMAGE_MODELS[0].value);
  const activeTextModels =
    apiConfig.provider === 'google' ? GOOGLE_TEXT_MODELS : OPENROUTER_TEXT_MODELS;
  const activeImageModels =
    apiConfig.provider === 'google' ? GOOGLE_IMAGE_MODELS : OPENROUTER_IMAGE_MODELS;
  const currentApiKey =
    apiConfig.provider === 'google'
      ? apiConfig.googleApiKey || ''
      : apiConfig.openRouterApiKey || '';
  const isCurrentApiKeyReady = currentApiKey.trim().length > 0;
  const isApiConfigPanelValid =
    apiConfig.provider === 'google'
      ? Boolean((apiConfig.googleApiKey || '').trim())
      : Boolean((apiConfig.openRouterApiKey || '').trim());

  useEffect(() => {
    const draft = loadSetupDraft();
    if (!draft) return;
    setHasStoredDraft(true);
    setDraftSavedAt(draft.savedAt);
  }, []);

  useEffect(() => {
    const storedConfig = loadApiConfigFromCookie();
    if (!storedConfig) return;

    const provider = storedConfig.provider === 'openrouter' ? 'openrouter' : 'google';
    setApiConfig({
      provider,
      googleModel:
        GOOGLE_TEXT_MODELS.find((item) => item.value === storedConfig.googleModel)?.value ||
        GOOGLE_TEXT_MODELS[0].value,
      openRouterModel:
        OPENROUTER_TEXT_MODELS.find((item) => item.value === storedConfig.openRouterModel)?.value ||
        OPENROUTER_TEXT_MODELS[0].value,
      imageModel:
        (provider === 'openrouter'
          ? OPENROUTER_IMAGE_MODELS.find((item) => item.value === storedConfig.imageModel)?.value
          : GOOGLE_IMAGE_MODELS.find((item) => item.value === storedConfig.imageModel)?.value) ||
        (provider === 'openrouter' ? OPENROUTER_IMAGE_MODELS[0].value : GOOGLE_IMAGE_MODELS[0].value),
      googleApiKey: storedConfig.googleApiKey || '',
      openRouterApiKey: storedConfig.openRouterApiKey || ''
    });
    setApiConfigStatus('已从浏览器 Cookie 恢复 API 配置。');
  }, []);

  useEffect(() => {
    const saveResult = savePersonas(personas);
    if (saveResult.ok === false) {
      console.warn('persona cache save failed:', saveResult.error);
    }
  }, [personas]);

  useEffect(() => {
    const validPersonaIds = new Set(personas.map((persona) => persona.id));
    setSelectedPersonaIds((previous) => {
      const next = previous.filter((id) => validPersonaIds.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [personas]);

  useEffect(() => {
    if (personas.some((persona) => persona.id === viewingPersonaId)) return;
    if (!personas.length) return;
    setViewingPersonaId(personas[0].id);
  }, [personas, viewingPersonaId]);

  const handleApiProviderChange = (provider: ApiConfig['provider']) => {
    setApiConfig((previous) => {
      const fallbackImageModel =
        provider === 'google' ? GOOGLE_IMAGE_MODELS[0].value : OPENROUTER_IMAGE_MODELS[0].value;
      const modelInProvider =
        provider === 'google'
          ? GOOGLE_IMAGE_MODELS.some((item) => item.value === previous.imageModel)
          : OPENROUTER_IMAGE_MODELS.some((item) => item.value === previous.imageModel);
      return {
        ...previous,
        provider,
        imageModel: modelInProvider ? previous.imageModel : fallbackImageModel
      };
    });
    setApiConfigStatus(null);
  };

  const handleSaveApiConfig = () => {
    const result = saveApiConfigToCookie(apiConfig);
    if (result.ok) {
      setApiConfigStatus('API 配置已保存到浏览器 Cookie，仅保存在你的本地浏览器。');
      return;
    }
    if ('error' in result) {
      setError(result.error);
    }
  };

  const handleClearApiConfig = () => {
    clearApiConfigCookie();
    setApiConfig((previous) => ({
      ...previous,
      googleApiKey: '',
      openRouterApiKey: ''
    }));
    setApiConfigStatus('本地 API 配置 Cookie 已清除。');
  };

  const handleTestApiConfig = async () => {
    setIsTestingApiConfig(true);
    setError(null);
    setApiConfigStatus(null);
    try {
      await testApiConfig(apiConfig);
      setApiConfigStatus('API Key 测试通过，当前模型可正常调用。');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'API Key 测试失败';
      setApiConfigStatus(`测试失败：${message}`);
    } finally {
      setIsTestingApiConfig(false);
    }
  };

  const handleStartEvaluation = () => {
    if (!isApiReadyForProvider) {
      setPageMode('setup');
      setIsApiConfigPanelOpen(true);
      setError('开始评测前，请先点击右上角“API 配置”填写并测试 API Key。');
      return;
    }
    setError(null);
    setPageMode('setup');
  };

  const handleCloseApiConfigPanel = () => {
    setIsApiConfigPanelOpen(false);
  };

  const goToNextStep = () => {
    setActiveStep((previous) => {
      if (previous === 1 && uploadComplete) return 2;
      if (previous === 2 && scenarioComplete) return 3;
      if (previous === 3 && frameworkComplete) return 4;
      return previous;
    });
  };

  const goToPreviousStep = () => {
    setActiveStep((previous) => {
      if (previous === 4) return 3;
      if (previous === 3) return 2;
      if (previous === 2) return 1;
      return previous;
    });
  };

  const handleSaveDraft = () => {
    const saveResult = saveSetupDraft({
      version: 1,
      savedAt: new Date().toISOString(),
      uploadMode,
      activeStep,
      selectedFrameworkId,
      selectedPersonaIds,
      scenario,
      shouldGenerateImages,
      sourceMeta: {
        singleFileName,
        videoFileName,
        flowStepCount: processSteps.length,
        flowStepNames: processSteps.map((step) => step.fileName || '未命名')
      }
    });
    if (saveResult.ok) {
      const now = new Date().toISOString();
      setHasStoredDraft(true);
      setDraftSavedAt(now);
      setInfoMessage('草稿已保存。稍后可点击“恢复草稿”继续配置（素材需重新上传）。');
      setError(null);
    } else if (saveResult.ok === false) {
      setError(saveResult.error);
    }
  };

  const handleRestoreDraft = () => {
    const draft = loadSetupDraft();
    if (!draft) {
      setError('没有可恢复的草稿。');
      return;
    }
    setUploadMode(draft.uploadMode);
    setActiveStep(draft.activeStep);
    setSelectedFrameworkId(draft.selectedFrameworkId);
    setSelectedPersonaIds(
      draft.selectedPersonaIds.filter((id) => personas.some((persona) => persona.id === id))
    );
    setScenario(draft.scenario);
    setShouldGenerateImages(draft.shouldGenerateImages);
    setSingleFileName(draft.sourceMeta.singleFileName || '');
    setVideoFileName(draft.sourceMeta.videoFileName || '');
    setImage(null);
    setVideo(null);
    setProcessSteps([]);
    resetAnalysisResult();
    setPageMode('setup');
    setShowAiGuide(false);
    setInfoMessage('草稿已恢复（本地文件安全限制，素材需要重新上传后再开始评测）。');
    setError(null);
    setHasStoredDraft(true);
    setDraftSavedAt(draft.savedAt);
  };

  const handleClearDraft = () => {
    clearSetupDraft();
    setHasStoredDraft(false);
    setDraftSavedAt(null);
    setInfoMessage('已清除本地草稿。');
  };

  const resetAnalysisResult = () => {
    setReports({});
    setAbComparisons({});
    setOptimizedImages({});
    setError(null);
    setShowSummary(false);
    setShowABSummary(true);
  };

  const resetABOnlyResult = () => {
    setAbComparisons({});
    setError(null);
    setShowABSummary(true);
  };

  const clearForMode = (mode: UploadMode, side: 'standard' | 'A' | 'B' = 'standard') => {
    if (side === 'A') {
      setAbUploadModeA(mode);
      setAbImageA(null);
      setAbVideoA(null);
      setAbProcessStepsA([]);
      setAbSingleFileNameA('');
      setAbVideoFileNameA('');
      setInfoMessage(null);
      resetABOnlyResult();
      return;
    }

    if (side === 'B') {
      setAbUploadModeB(mode);
      setAbImageB(null);
      setAbVideoB(null);
      setAbProcessStepsB([]);
      setAbSingleFileNameB('');
      setAbVideoFileNameB('');
      setInfoMessage(null);
      resetABOnlyResult();
      return;
    }

    setUploadMode(mode);
    setImage(null);
    setVideo(null);
    setProcessSteps([]);
    setSingleFileName('');
    setVideoFileName('');
    setInfoMessage(null);
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

  const handleABInputFiles = (files: File[], side: 'A' | 'B') => {
    if (!files.length) return;
    const mode = side === 'A' ? abUploadModeA : abUploadModeB;
    const setImageState = side === 'A' ? setAbImageA : setAbImageB;
    const setVideoState = side === 'A' ? setAbVideoA : setAbVideoB;
    const setStepsState = side === 'A' ? setAbProcessStepsA : setAbProcessStepsB;
    const setSingleNameState = side === 'A' ? setAbSingleFileNameA : setAbSingleFileNameB;
    const setVideoNameState = side === 'A' ? setAbVideoFileNameA : setAbVideoFileNameB;

    if (mode === 'single') {
      const file = files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageState(reader.result as string);
        setVideoState(null);
        setStepsState([]);
        setSingleNameState(file.name);
        setVideoNameState('');
        resetABOnlyResult();
      };
      reader.readAsDataURL(file);
      return;
    }

    if (mode === 'video') {
      const file = files[0];
      if (file.size > 50 * 1024 * 1024) {
        alert('视频大于 50MB，请压缩后再上传。');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setVideoState(reader.result as string);
        setImageState(null);
        setStepsState([]);
        setVideoNameState(file.name);
        setSingleNameState('');
        resetABOnlyResult();
      };
      reader.readAsDataURL(file);
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) return;
    setImageState(null);
    setVideoState(null);
    setSingleNameState('');
    setVideoNameState('');
    setStepsState([]);
    resetABOnlyResult();

    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setStepsState((previous) => [
          ...previous,
          {
            id: `${side}-${Date.now()}-${Math.random()}`,
            image: reader.result as string,
            description: '',
            fileName: file.name
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

  const updateABFlowStepDescription = (side: 'A' | 'B', id: string, description: string) => {
    const setState = side === 'A' ? setAbProcessStepsA : setAbProcessStepsB;
    setState((previous) => previous.map((step) => (step.id === id ? { ...step, description } : step)));
  };

  const removeFlowStep = (id: string) => {
    setProcessSteps((previous) => previous.filter((step) => step.id !== id));
  };

  const removeABFlowStep = (side: 'A' | 'B', id: string) => {
    const setState = side === 'A' ? setAbProcessStepsA : setAbProcessStepsB;
    setState((previous) => previous.filter((step) => step.id !== id));
  };

  const handleDropUpload: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setIsDropActive(false);
    const files = extractFiles(event.dataTransfer.files);
    handleInputFiles(files);
  };

  const handleABDropUpload =
    (side: 'A' | 'B'): React.DragEventHandler<HTMLDivElement> =>
    (event) => {
      event.preventDefault();
      setIsDropActive(false);
      const files = extractFiles(event.dataTransfer.files);
      handleABInputFiles(files, side);
    };

  const clearABSide = (side: 'A' | 'B', mode: UploadMode) => {
    if (side === 'A') {
      setAbUploadModeA(mode);
      setAbImageA(null);
      setAbVideoA(null);
      setAbProcessStepsA([]);
      setAbSingleFileNameA('');
      setAbVideoFileNameA('');
    } else {
      setAbUploadModeB(mode);
      setAbImageB(null);
      setAbVideoB(null);
      setAbProcessStepsB([]);
      setAbSingleFileNameB('');
      setAbVideoFileNameB('');
    }
    setInfoMessage(null);
    resetABOnlyResult();
  };

  const abMainLabel = (side: 'A' | 'B') => {
    const mode = side === 'A' ? abUploadModeA : abUploadModeB;
    if (mode === 'single') return `上传 ${side} 方案单页截图`;
    if (mode === 'flow') return `上传 ${side} 方案流程截图（可多选）`;
    return `上传 ${side} 方案视频（mp4/webm/mov）`;
  };

  const toggleDocCandidateSelection = (id: string) => {
    setSelectedDocPersonaCandidateIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]
    );
  };

  const extractFromDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsExtractingFromDoc(true);
    setError(null);
    setInfoMessage(null);
    try {
      const text = await extractTextFromFile(file);
      if (!text.trim()) {
        throw new Error('文档未解析到有效文本，请更换文件后重试。');
      }
      const recommendations = await extractPersonasFromText(text, apiConfig);
      if (!recommendations.length) {
        setDocPersonaCandidates([]);
        setSelectedDocPersonaCandidateIds([]);
        setInfoMessage('未提取到可用角色，请尝试更详细的文档内容。');
      } else {
        setDocPersonaCandidates(recommendations);
        setSelectedDocPersonaCandidateIds(recommendations.map((item) => item.id));
        setInfoMessage(`已从文档提取 ${recommendations.length} 个候选角色，请预览后导入。`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '文档角色提取失败');
    } finally {
      setIsExtractingFromDoc(false);
      event.target.value = '';
    }
  };

  const importFromExtractedCandidates = () => {
    const selected = docPersonaCandidates.filter((candidate) =>
      selectedDocPersonaCandidateIds.includes(candidate.id)
    );
    if (!selected.length) {
      setError('请先选择至少 1 个提取角色。');
      return;
    }

    const createdIds: string[] = [];
    setPersonas((previous) => {
      const next = [...previous];
      selected.forEach((candidate, index) => {
        if (!candidate.personaDraft) return;
        const personaId = `persona-${Date.now()}-${index}`;
        createdIds.push(personaId);
        next.push({
          id: personaId,
          name: candidate.personaDraft.name?.trim() || `文档角色 ${index + 1}`,
          description: candidate.personaDraft.description?.trim() || '文档提取角色',
          role: candidate.personaDraft.role === UserRole.EXPERT ? UserRole.EXPERT : UserRole.USER,
          attributes: normalizeImportedAttributes(candidate.personaDraft.attributes)
        });
      });
      return next;
    });
    setSelectedPersonaIds((previous) => [...new Set([...previous, ...createdIds])]);
    setInfoMessage(`已导入 ${createdIds.length} 个文档提取角色并自动勾选。`);
    setError(null);
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

  const normalizeAttributesInput = (rows: PersonaAttributeRow[]) =>
    rows.reduce<Record<string, string>>((acc, row) => {
      const key = row.key.trim();
      if (!key) return acc;
      acc[key] = row.value.trim();
      return acc;
    }, {});

  const normalizeImportedAttributes = (attributes: unknown): Record<string, string> => {
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return {};

    return Object.entries(attributes as Record<string, unknown>).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        const normalizedKey = key.trim();
        if (!normalizedKey) return acc;
        acc[normalizedKey] = typeof value === 'string' ? value : value == null ? '' : String(value);
        return acc;
      },
      {}
    );
  };

  const updatePersonaDraftField = (key: keyof Omit<Persona, 'id' | 'attributes'>, value: string) => {
    setPersonaDraft((previous) => ({
      ...previous,
      [key]: key === 'role' ? (value as UserRole) : value
    }));
  };

  const updatePersonaAttributeRow = (rowId: string, key: 'key' | 'value', value: string) => {
    setPersonaDraftRows((previous) =>
      previous.map((row) => (row.id === rowId ? { ...row, [key]: value } : row))
    );
  };

  const addPersonaAttributeRow = () => {
    setPersonaDraftRows((previous) => [...previous, createAttributeRow()]);
  };

  const removePersonaAttributeRow = (rowId: string) => {
    setPersonaDraftRows((previous) => {
      if (previous.length <= 1) {
        return [{ ...previous[0], key: '', value: '' }];
      }
      return previous.filter((row) => row.id !== rowId);
    });
  };

  const closePersonaModal = () => {
    setPersonaModalOpen(false);
    setEditingPersonaId(null);
    setPersonaDraft(EMPTY_PERSONA);
    setPersonaDraftRows([createAttributeRow()]);
  };

  const openCreatePersonaModal = () => {
    setPersonaModalMode('create');
    setEditingPersonaId(null);
    setPersonaDraft(EMPTY_PERSONA);
    setPersonaDraftRows([createAttributeRow()]);
    setPersonaModalOpen(true);
  };

  const openEditPersonaModal = (persona: Persona) => {
    setPersonaModalMode('edit');
    setEditingPersonaId(persona.id);
    setPersonaDraft({
      name: persona.name,
      role: persona.role,
      description: persona.description,
      attributes: { ...persona.attributes }
    });
    setPersonaDraftRows(attributesToRows(persona.attributes));
    setPersonaModalOpen(true);
  };

  const getRoleLabel = (role: UserRole) =>
    role === UserRole.EXPERT ? '专家评审' : '普通用户';

  const upsertPersona = () => {
    const normalizedName = personaDraft.name.trim();
    const normalizedDescription = personaDraft.description.trim();
    if (!normalizedName || !normalizedDescription || !personaDraft.role) {
      setError('角色名称、角色描述、角色类型为必填项。');
      return;
    }

    const payload: Omit<Persona, 'id'> = {
      name: normalizedName,
      description: normalizedDescription,
      role: personaDraft.role,
      attributes: normalizeAttributesInput(personaDraftRows)
    };

    if (personaModalMode === 'edit' && editingPersonaId) {
      setPersonas((previous) =>
        previous.map((persona) => (persona.id === editingPersonaId ? { ...persona, ...payload } : persona))
      );
      setInfoMessage(`角色「${normalizedName}」已更新。`);
      setError(null);
      closePersonaModal();
      return;
    }

    const id = `persona-${Date.now()}`;
    setPersonas((previous) => [...previous, { ...payload, id }]);
    setSelectedPersonaIds((previous) => [...new Set([...previous, id])]);
    setInfoMessage(`角色「${normalizedName}」已创建并加入评测。`);
    setError(null);
    closePersonaModal();
  };

  const createPersonaFromRecommendation = (draft: Omit<Persona, 'id'>) => {
    const id = `persona-${Date.now()}`;
    const normalizedPersona: Persona = {
      ...draft,
      id,
      name: draft.name?.trim() || `AI 角色 ${id.slice(-4)}`,
      description: draft.description?.trim() || 'AI 推荐角色',
      role: draft.role === UserRole.EXPERT ? UserRole.EXPERT : UserRole.USER,
      attributes: normalizeImportedAttributes(draft.attributes)
    };
    setPersonas((previous) => [...previous, normalizedPersona]);
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
    setInfoMessage('配置已导出为 JSON。');
  };

  const importPersona = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const parsed = JSON.parse(loadEvent.target?.result as string) as Partial<Omit<Persona, 'id'>>;
        const normalizedName = typeof parsed.name === 'string' ? parsed.name.trim() : '';
        const normalizedDescription =
          typeof parsed.description === 'string' ? parsed.description.trim() : '';
        if (parsed.role !== UserRole.USER && parsed.role !== UserRole.EXPERT) {
          throw new Error('角色文件缺少必要字段：角色分类（USER 或 EXPERT）。');
        }
        const normalizedRole = parsed.role;
        if (!normalizedName || !normalizedDescription) {
          throw new Error('角色文件缺少必要字段：角色名称、角色描述。');
        }

        const id = `persona-${Date.now()}`;
        setPersonas((previous) => [
          ...previous,
          {
            id,
            name: normalizedName,
            description: normalizedDescription,
            role: normalizedRole,
            attributes: normalizeImportedAttributes(parsed.attributes)
          }
        ]);
        setSelectedPersonaIds((previous) => [...new Set([...previous, id])]);
        setInfoMessage(`角色「${normalizedName}」导入成功。`);
        setError(null);
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
    if (!currentSetupInput) return;
    setIsInferringScenario(true);
    setError(null);
    setInfoMessage(null);
    try {
      const inferred = await inferScenarioFromInput(currentSetupInput, apiConfig);
      setScenario((previous) => ({
        ...previous,
        ...inferred,
        source: previous.businessGoal || previous.keyTasks ? 'mixed' : 'ai_inferred'
      }));
      setShowAiGuide(false);
      setInfoMessage('AI 已生成场景草稿，请确认并按需修改。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '场景提炼失败');
    } finally {
      setIsInferringScenario(false);
    }
  };

  const fetchPersonaRecommendations = async () => {
    if (!currentSetupInput || !selectedFramework) return;
    setIsRecommending(true);
    setError(null);
    setInfoMessage(null);
    try {
      const recommendations = await recommendPersonas({
        input: currentSetupInput,
        framework: selectedFramework,
        scenario,
        existingPersonas: personas,
        mode: 'balanced',
        apiConfig
      });
      setPersonaRecommendations(recommendations);
    } catch (err) {
      setError(err instanceof Error ? err.message : '角色推荐失败');
    } finally {
      setIsRecommending(false);
    }
  };

  const fetchNewPersonaRecommendations = async () => {
    if (!currentSetupInput || !selectedFramework) return;
    setIsRecommendingNewPersona(true);
    setError(null);
    setInfoMessage(null);
    try {
      const recommendations = await recommendPersonas({
        input: currentSetupInput,
        framework: selectedFramework,
        scenario,
        existingPersonas: personas,
        mode: 'new_only',
        apiConfig
      });
      setPersonaRecommendations(recommendations);
    } catch (err) {
      setError(err instanceof Error ? err.message : '新角色生成失败');
    } finally {
      setIsRecommendingNewPersona(false);
    }
  };

  const analyze = async () => {
    const analyzeInputStandard = currentInput;
    const analyzeInputA = currentInputA;
    const analyzeInputB = currentInputB;
    if (!selectedFramework || selectedPersonas.length === 0) return;
    if (uploadConfigMode === 'standard' && !analyzeInputStandard) return;
    if (uploadConfigMode === 'ab_test' && (!analyzeInputA || !analyzeInputB)) return;
    if (!isApiReadyForProvider) {
      setError('请先点击右上角“API 配置”填写并测试 API Key，再开始评测。');
      setIsApiConfigPanelOpen(true);
      return;
    }

    setIsAnalyzing(true);
    setShowSummary(false);
    setShowABSummary(true);
    setViewingPersonaId(selectedPersonas[0].id);
    setError(null);
    setInfoMessage(null);
    setReports({});
    setAbComparisons({});

    try {
      if (uploadConfigMode === 'standard') {
        const resultEntries = await Promise.all(
          selectedPersonas.map(async (persona) => {
            const report = await analyzeDesign(
              analyzeInputStandard as string | ProcessStep[],
              persona,
              selectedFramework,
              apiConfig,
              scenario
            );
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
      } else {
        const resultEntries = await Promise.all(
          selectedPersonas.map(async (persona) => {
            const [reportA, reportB] = await Promise.all([
              analyzeDesign(analyzeInputA as string | ProcessStep[], persona, selectedFramework, apiConfig, scenario),
              analyzeDesign(analyzeInputB as string | ProcessStep[], persona, selectedFramework, apiConfig, scenario)
            ]);
            const comparison = compareABReports({
              reportA,
              reportB,
              personaId: persona.id,
              frameworkId: selectedFramework.id,
              frameworkName: selectedFramework.name,
              comparabilityNote: abComparableWeak ? 'A/B 素材类型不一致，可比性较弱。' : undefined
            });
            return { personaId: persona.id, comparison };
          })
        );
        const nextComparisons: Record<string, ABComparisonReport> = {};
        resultEntries.forEach((entry) => {
          nextComparisons[entry.personaId] = entry.comparison;
        });
        setAbComparisons(nextComparisons);
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
  const analyzeTargetLabel =
    uploadConfigMode === 'standard'
      ? '开始评测'
      : isAnalyzing
      ? 'A/B 对比中...'
      : '开始 A/B 对比评测';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-end gap-2 px-4 py-2 md:px-6">
          <button
            onClick={() => {
              if (pageMode !== 'setup') {
                setPageMode('setup');
              }
              setIsApiConfigPanelOpen(true);
            }}
            className="inline-flex items-center rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            API 配置
          </button>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            GitHub 仓库
          </a>
        </div>
      </div>
      {pageMode === 'landing' ? (
        <LandingPage
          hasStoredDraft={hasStoredDraft}
          draftSavedAt={draftSavedAt}
          onStartEvaluation={handleStartEvaluation}
          onRestoreDraft={handleRestoreDraft}
          githubRepoUrl={GITHUB_REPO_URL}
        />
      ) : pageMode === 'setup' ? (
        <div className="mx-auto max-w-4xl p-4 md:p-6 pb-28 space-y-4">
          <header className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="space-y-1">
                  <h1 className="text-xl font-semibold">AI 用户体验评测</h1>
                  <p className="text-sm text-slate-600">当前状态：{currentStageTitle}</p>
                </div>
                <button
                  onClick={() => setPageMode('landing')}
                  className="inline-flex w-fit items-center rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  返回首页
                </button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {canExportSetupConfig && (
                  <button onClick={exportSetupConfig} className="rounded-lg border border-slate-200 px-3 py-2">
                    导出评测配置
                  </button>
                )}
                <button onClick={handleSaveDraft} className="rounded-lg border border-slate-200 px-3 py-2">
                  保存草稿
                </button>
                <button
                  onClick={handleRestoreDraft}
                  disabled={!hasStoredDraft}
                  className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-50"
                >
                  恢复草稿
                </button>
                <button
                  onClick={handleClearDraft}
                  disabled={!hasStoredDraft}
                  className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-50"
                >
                  清除草稿
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>流程进度</span>
                <span>{timelineProgressPercent}%</span>
              </div>
              <div className="flex items-center gap-2">
                {completionList.map((item, index) => {
                  const status = stageStatuses[index];
                  const connectorFill =
                    status === 'completed' ? 100 : status === 'current' ? 50 : 0;
                  return (
                    <React.Fragment key={item.id}>
                      <button
                        onClick={() => setActiveStep((index + 1) as SetupStep)}
                        className="flex min-w-[86px] flex-col items-center gap-1 text-[11px]"
                      >
                        {status === 'completed' ? (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] text-white">
                            ✓
                          </span>
                        ) : status === 'current' ? (
                          <span className="relative inline-flex h-5 w-5 items-center justify-center">
                            <span className="absolute h-5 w-5 rounded-full bg-blue-200 animate-pulse" />
                            <span className="relative h-2.5 w-2.5 rounded-full bg-blue-600" />
                          </span>
                        ) : (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-300 bg-white" />
                        )}
                        <span className={status === 'pending' ? 'text-slate-500' : 'text-slate-800'}>{item.label}</span>
                      </button>
                      {index < completionList.length - 1 && (
                        <div className="h-1 flex-1 rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${connectorFill}%` }} />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">Shipment Progress</p>
                <p className="text-[11px] text-slate-500">当前步骤</p>
              </div>
              <div className="mt-2 flex gap-2 text-[11px]">
                <span className="pt-0.5">
                  <span className="relative inline-flex h-4 w-4 items-center justify-center">
                    <span className="absolute h-4 w-4 rounded-full bg-blue-200 animate-pulse" />
                    <span className="relative h-2 w-2 rounded-full bg-blue-600" />
                  </span>
                </span>
                <div className="space-y-0.5">
                  <p className="text-slate-700">{STEP_TITLES[activeStep - 1]}</p>
                  <p className="text-slate-500">必须动作：{currentRequiredActions.join('；')}</p>
                </div>
              </div>
              {draftSavedAt && <p className="mt-2 text-[11px] text-slate-500">最近草稿：{new Date(draftSavedAt).toLocaleString()}</p>}
            </div>
          </header>

          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {infoMessage && <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">{infoMessage}</div>}

          <section className={`rounded-xl border bg-white p-4 space-y-3 ${activeStep === 1 ? 'border-slate-400' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1">
                <h2 className="text-base font-semibold">步骤 1：{STEP_TITLES[0]}</h2>
                <p className={`text-xs ${uploadComplete ? 'text-emerald-700' : 'text-amber-600'}`}>
                  {uploadComplete ? '素材已就绪' : '请先上传至少 1 份可评测素材'}
                </p>
              </div>
              {activeStep === 1 ? (
                <button
                  onClick={() => {
                    if (uploadConfigMode === 'standard') {
                      clearForMode(uploadMode);
                      return;
                    }
                    clearABSide('A', abUploadModeA);
                    clearABSide('B', abUploadModeB);
                  }}
                  className="text-xs text-slate-500 underline"
                >
                  清空素材
                </button>
              ) : (
                <button onClick={() => setActiveStep(1)} className="text-xs text-slate-500 underline">
                  展开编辑
                </button>
              )}
            </div>

            {activeStep === 1 ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {([
                    { value: 'standard' as UploadConfigMode, label: '标准评测' },
                    { value: 'ab_test' as UploadConfigMode, label: 'A/B 对比评测' }
                  ]).map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => {
                        setUploadConfigMode(mode.value);
                        resetAnalysisResult();
                      }}
                      className={`rounded-lg border px-3 py-2 ${
                        uploadConfigMode === mode.value ? 'border-slate-400 bg-slate-100' : 'border-slate-200'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {uploadConfigMode === 'standard' ? (
                  <>
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
                  </>
                ) : (
                  <>
                    {abComparableWeak && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                        当前 A/B 素材类型不一致（例如 A=图片、B=视频），系统仍可评估，但会提示“可比性较弱”。
                      </div>
                    )}
                    {(['A', 'B'] as const).map((side) => {
                      const mode = side === 'A' ? abUploadModeA : abUploadModeB;
                      const setMode = side === 'A' ? setAbUploadModeA : setAbUploadModeB;
                      const imageData = side === 'A' ? abImageA : abImageB;
                      const videoData = side === 'A' ? abVideoA : abVideoB;
                      const steps = side === 'A' ? abProcessStepsA : abProcessStepsB;
                      const singleName = side === 'A' ? abSingleFileNameA : abSingleFileNameB;
                      const videoName = side === 'A' ? abVideoFileNameA : abVideoFileNameB;
                      const imageRef = side === 'A' ? abImageInputRefA : abImageInputRefB;
                      const videoRef = side === 'A' ? abVideoInputRefA : abVideoInputRefB;
                      const flowRef = side === 'A' ? abFlowInputRefA : abFlowInputRefB;
                      return (
                        <div key={side} className="rounded-xl border border-slate-200 p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-800">方案 {side}</p>
                            <button
                              onClick={() => clearABSide(side, mode)}
                              className="text-xs text-slate-500 underline"
                            >
                              清空该方案
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            {(['single', 'flow', 'video'] as UploadMode[]).map((candidateMode) => (
                              <button
                                key={`${side}-${candidateMode}`}
                                onClick={() => {
                                  setMode(candidateMode);
                                  clearABSide(side, candidateMode);
                                }}
                                className={`rounded-lg border px-3 py-2 ${
                                  mode === candidateMode
                                    ? 'border-slate-400 bg-slate-100'
                                    : 'border-slate-200'
                                }`}
                              >
                                {candidateMode === 'single'
                                  ? '单页截图'
                                  : candidateMode === 'flow'
                                  ? '流程截图'
                                  : '视频录屏'}
                              </button>
                            ))}
                          </div>
                          <div
                            onDrop={handleABDropUpload(side)}
                            onDragOver={(event) => {
                              event.preventDefault();
                              setIsDropActive(true);
                            }}
                            onDragLeave={() => setIsDropActive(false)}
                            className={`rounded-lg border-2 border-dashed p-5 text-center ${
                              isDropActive ? 'border-slate-500 bg-slate-50' : 'border-slate-300 bg-white'
                            }`}
                          >
                            <p className="text-sm font-medium">{abMainLabel(side)}</p>
                            <p className="text-xs text-slate-500 mt-1">支持拖拽上传或点击选择文件</p>
                            {mode === 'single' && (
                              <>
                                <button onClick={() => imageRef.current?.click()} className="mt-3 rounded-lg border px-4 py-2 text-sm">
                                  选择图片
                                </button>
                                <input
                                  ref={imageRef}
                                  type="file"
                                  accept="image/*"
                                  onChange={(event) => handleABInputFiles(extractFiles(event.target.files), side)}
                                  className="hidden"
                                />
                              </>
                            )}
                            {mode === 'video' && (
                              <>
                                <button onClick={() => videoRef.current?.click()} className="mt-3 rounded-lg border px-4 py-2 text-sm">
                                  选择视频
                                </button>
                                <input
                                  ref={videoRef}
                                  type="file"
                                  accept="video/mp4,video/webm,video/quicktime"
                                  onChange={(event) => handleABInputFiles(extractFiles(event.target.files), side)}
                                  className="hidden"
                                />
                              </>
                            )}
                            {mode === 'flow' && (
                              <>
                                <button onClick={() => flowRef.current?.click()} className="mt-3 rounded-lg border px-4 py-2 text-sm">
                                  选择流程图片
                                </button>
                                <input
                                  ref={flowRef}
                                  type="file"
                                  multiple
                                  accept="image/*"
                                  onChange={(event) => handleABInputFiles(extractFiles(event.target.files), side)}
                                  className="hidden"
                                />
                              </>
                            )}
                          </div>
                          {mode === 'single' && imageData && (
                            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                              <p className="text-xs text-slate-500">已上传：{singleName || '图片文件'}</p>
                              <img src={imageData} alt={`方案${side}单页截图`} className="max-h-52 rounded-md" />
                            </div>
                          )}
                          {mode === 'video' && videoData && (
                            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                              <p className="text-xs text-slate-500">已上传：{videoName || '视频文件'}</p>
                              <video src={videoData} controls className="max-h-52 rounded-md" />
                            </div>
                          )}
                          {mode === 'flow' && steps.length > 0 && (
                            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                              <p className="text-xs text-slate-500">已上传：{steps.length} 张流程图</p>
                              {steps.map((step, index) => (
                                <div key={step.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2 space-y-2">
                                  <p className="text-xs text-slate-500">
                                    步骤 {index + 1} {step.fileName ? `· ${step.fileName}` : ''}
                                  </p>
                                  <img src={step.image} alt={`方案${side}步骤${index + 1}`} className="max-h-24 rounded-md" />
                                  <textarea
                                    value={step.description}
                                    onChange={(event) =>
                                      updateABFlowStepDescription(side, step.id, event.target.value)
                                    }
                                    placeholder="补充步骤描述（可选）"
                                    rows={2}
                                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                                  />
                                  <button
                                    onClick={() => removeABFlowStep(side, step.id)}
                                    className="text-xs text-rose-600 underline"
                                  >
                                    删除此步骤
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                当前为折叠状态，点击“展开编辑”可修改上传素材。
              </div>
            )}
          </section>

          {activeStep >= 2 && (
            <section className={`rounded-xl border bg-white p-4 ${activeStep === 2 ? 'border-slate-400' : 'border-slate-200'}`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold">步骤 2：{STEP_TITLES[1]}</h2>
                  <p className={`text-xs ${scenarioComplete ? 'text-emerald-700' : 'text-amber-600'}`}>
                    {scenarioComplete
                      ? '关键场景字段已完成'
                      : `还需填写：${missingScenarioFields.map((field) => SCENARIO_FIELD_LABELS[field]).join('、')}`}
                  </p>
                </div>
                {activeStep !== 2 && (
                  <button onClick={() => setActiveStep(2)} className="text-xs text-slate-500 underline">
                    展开编辑
                  </button>
                )}
              </div>
              {activeStep === 2 ? (
                <ScenarioEditor
                  scenario={scenario}
                  onChange={setScenario}
                  onInfer={inferScenario}
                  isInferring={isInferringScenario}
                  canInfer={!!currentSetupInput}
                  showAiGuide={showAiGuide && activeStep === 2}
                  onDismissAiGuide={() => setShowAiGuide(false)}
                />
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  当前为折叠状态。已填写内容会保留，点击“展开编辑”可继续补充。
                </div>
              )}
            </section>
          )}

          {activeStep >= 3 && (
            <section className={`rounded-xl border bg-white p-4 space-y-3 ${activeStep === 3 ? 'border-slate-400' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold">步骤 3：{STEP_TITLES[2]}</h2>
                  <p className={`text-xs ${frameworkComplete ? 'text-emerald-700' : 'text-amber-600'}`}>
                    {frameworkComplete ? `已选择：${selectedFramework?.name}` : '请选择评测体系后继续'}
                  </p>
                </div>
                {activeStep !== 3 && (
                  <button onClick={() => setActiveStep(3)} className="text-xs text-slate-500 underline">
                    展开编辑
                  </button>
                )}
              </div>
              {activeStep === 3 ? (
                <>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <select
                      value={selectedFrameworkId}
                      onChange={(event) => setSelectedFrameworkId(event.target.value)}
                      className="rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <option value="">请选择评测体系（评测维度）</option>
                      {frameworks.map((framework) => (
                        <option key={framework.id} value={framework.id}>
                          {framework.name}（{framework.source === 'builtin' ? '内置' : '自定义'}）
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-slate-500">
                    {selectedFramework
                      ? `${selectedFramework.description}。模型与 API Key 请通过右上角“API 配置”设置。`
                      : '请选择一个评测体系，系统将按该体系生成报告。模型与 API Key 在右上角配置。'}
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
                </>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  当前为折叠状态。点击“展开编辑”可更换评测体系（评测维度）。
                </div>
              )}
            </section>
          )}

          {activeStep >= 4 && (
            <section className={`rounded-xl border bg-white p-4 space-y-3 ${activeStep === 4 ? 'border-slate-400' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold">步骤 4：{STEP_TITLES[3]}</h2>
                  <p className={`text-xs ${personaComplete ? 'text-emerald-700' : 'text-amber-600'}`}>
                    {personaComplete ? `已选 ${selectedPersonaIds.length} 个角色` : '请至少勾选 1 个角色'}
                  </p>
                </div>
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
                    onClick={openCreatePersonaModal}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
                  >
                    新建角色
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {personas.map((persona) => (
                  <div key={persona.id} className="block rounded-lg border border-slate-200 bg-slate-50 p-2">
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
                          <p className="mt-1 text-[11px] text-slate-400">角色分类：{getRoleLabel(persona.role)}</p>
                          {!!Object.keys(persona.attributes || {}).length && (
                            <p className="mt-1 text-[11px] text-slate-400">
                              维度：{Object.keys(persona.attributes).join(' / ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditPersonaModal(persona)}
                          className="text-xs text-slate-500 underline"
                        >
                          查看/修改
                        </button>
                        <button
                          type="button"
                          onClick={() => exportPersona(persona)}
                          className="text-xs text-slate-500 underline"
                        >
                          导出
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={fetchPersonaRecommendations}
                  disabled={!currentSetupInput || isRecommending || isRecommendingNewPersona}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-50"
                >
                  {isRecommending ? '推荐中...' : 'AI 推荐角色'}
                </button>
                <button
                  onClick={fetchNewPersonaRecommendations}
                  disabled={!currentSetupInput || isRecommendingNewPersona || isRecommending}
                  className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700 disabled:opacity-50"
                >
                  {isRecommendingNewPersona ? '生成中...' : 'AI 生成新角色'}
                </button>
                <button
                  onClick={() => personaExtractRef.current?.click()}
                  disabled={isExtractingFromDoc}
                  className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700 disabled:opacity-50"
                >
                  {isExtractingFromDoc ? '提取中...' : '从文档提取角色'}
                </button>
                <input
                  ref={personaExtractRef}
                  type="file"
                  accept=".txt,.md,.doc,.docx,.pdf,text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={extractFromDocument}
                  className="hidden"
                />
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  <input
                    type="checkbox"
                    checked={shouldGenerateImages}
                    onChange={() => setShouldGenerateImages((previous) => !previous)}
                    disabled={uploadConfigMode === 'ab_test' || uploadMode === 'video'}
                  />
                  生成优化效果图（视频模式关闭，A/B 模式关闭）
                </label>
              </div>

              {docPersonaCandidates.length > 0 && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-sky-900">文档提取结果预览</p>
                      <p className="text-xs text-sky-700">
                        可从同一文档中提取多个角色，勾选后“一键导入并选中”。
                      </p>
                    </div>
                    <button
                      onClick={importFromExtractedCandidates}
                      disabled={!selectedDocPersonaCandidateIds.length}
                      className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs text-sky-700 disabled:opacity-50"
                    >
                      一键导入已选角色（{selectedDocPersonaCandidateIds.length}）
                    </button>
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {docPersonaCandidates.map((candidate) => {
                      const draft = candidate.personaDraft;
                      if (!draft) return null;
                      const checked = selectedDocPersonaCandidateIds.includes(candidate.id);
                      return (
                        <label
                          key={candidate.id}
                          className={`block rounded-lg border p-2 text-xs ${
                            checked ? 'border-sky-300 bg-white' : 'border-sky-100 bg-sky-50'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDocCandidateSelection(candidate.id)}
                              className="mt-0.5"
                            />
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-slate-800">
                                {draft.name} · {getRoleLabel(draft.role)}
                              </p>
                              <p className="text-slate-600">{draft.description}</p>
                              <p className="text-slate-500">提取依据：{candidate.reasoning}</p>
                              {!!Object.keys(draft.attributes || {}).length && (
                                <p className="text-slate-500">
                                  维度：{Object.entries(draft.attributes)
                                    .slice(0, 4)
                                    .map(([key, value]) => `${key}:${value}`)
                                    .join('；')}
                                </p>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

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

          {isApiConfigPanelOpen && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 px-4">
              <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">API 配置</p>
                    <p className="text-xs text-slate-500">
                      选择模型并配置 API Key。我们不会收集你的 API Key，仅会保存到你的浏览器 Cookie（你主动保存时）。
                    </p>
                  </div>
                  <button onClick={handleCloseApiConfigPanel} className="text-xs text-slate-500 underline">
                    关闭
                  </button>
                </div>
                <div className="max-h-[70vh] space-y-3 overflow-y-auto px-4 py-4">
                  <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                    <select
                      value={apiConfig.provider}
                      onChange={(event) =>
                        handleApiProviderChange(event.target.value as ApiConfig['provider'])
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2"
                    >
                      {PROVIDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={currentTextModel}
                      onChange={(event) =>
                        setApiConfig((previous) =>
                          previous.provider === 'google'
                            ? { ...previous, googleModel: event.target.value }
                            : { ...previous, openRouterModel: event.target.value }
                        )
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2"
                    >
                      {activeTextModels.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <select
                      value={currentImageModel}
                      onChange={(event) =>
                        setApiConfig((previous) => ({
                          ...previous,
                          imageModel: event.target.value
                        }))
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2"
                    >
                      {activeImageModels.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-700">
                        {apiConfig.provider === 'google' ? 'Google API Key' : 'OpenRouter API Key'}
                      </span>
                      <input
                        type="password"
                        value={currentApiKey}
                        onChange={(event) =>
                          setApiConfig((previous) =>
                            previous.provider === 'google'
                              ? { ...previous, googleApiKey: event.target.value }
                              : { ...previous, openRouterApiKey: event.target.value }
                          )
                        }
                        placeholder={
                          apiConfig.provider === 'google'
                            ? '请输入 Google API Key'
                            : '请输入 OpenRouter API Key'
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <p className="text-[11px] text-slate-500">
                      网站不会收集你的 API Key。仅在你点击“保存到浏览器 Cookie”后，才会保存在你本地浏览器中。
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        onClick={handleTestApiConfig}
                        disabled={isTestingApiConfig || !currentApiKey.trim()}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 disabled:opacity-50"
                      >
                        {isTestingApiConfig ? '测试中...' : 'Test API Key'}
                      </button>
                      <button
                        onClick={handleSaveApiConfig}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        保存到浏览器 Cookie
                      </button>
                      <button
                        onClick={handleClearApiConfig}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        清除本地 Key
                      </button>
                    </div>
                    {apiConfigStatus && (
                      <p
                        className={`text-xs ${
                          apiConfigStatus.includes('失败') ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        {apiConfigStatus}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
                  <button
                    onClick={handleCloseApiConfigPanel}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
                  >
                    完成
                  </button>
                </div>
              </div>
            </div>
          )}

          {personaModalOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 px-4">
              <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {personaModalMode === 'create' ? '新建评测角色' : '查看/修改评测角色'}
                    </p>
                    <p className="text-xs text-slate-500">
                      角色名称、角色描述、角色分类为必填；其余角色维度可灵活增删改。
                    </p>
                  </div>
                  <button onClick={closePersonaModal} className="text-xs text-slate-500 underline">
                    关闭
                  </button>
                </div>

                <div className="max-h-[70vh] overflow-y-auto space-y-4 px-4 py-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-medium text-slate-600">角色名称（必填）</span>
                      <input
                        value={personaDraft.name}
                        onChange={(event) => updatePersonaDraftField('name', event.target.value)}
                        placeholder="例如：银发新手用户"
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-medium text-slate-600">角色描述（必填）</span>
                      <textarea
                        value={personaDraft.description}
                        onChange={(event) => updatePersonaDraftField('description', event.target.value)}
                        placeholder="该描述将用于拼接到最终 AI 提示词中，请尽量具体。"
                        rows={3}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-medium text-slate-600">角色分类（必填）</span>
                      <select
                        value={personaDraft.role}
                        onChange={(event) => updatePersonaDraftField('role', event.target.value)}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value={UserRole.USER}>普通用户</option>
                        <option value={UserRole.EXPERT}>专家评审</option>
                      </select>
                    </label>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-700">角色维度（可选，支持动态扩展）</p>
                      <button onClick={addPersonaAttributeRow} className="text-xs text-slate-600 underline">
                        + 新增维度
                      </button>
                    </div>
                    <div className="space-y-2">
                      {personaDraftRows.map((row, index) => (
                        <div key={row.id} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                          <input
                            value={row.key}
                            onChange={(event) => updatePersonaAttributeRow(row.id, 'key', event.target.value)}
                            placeholder="维度名称（如：科技熟练度）"
                            className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                          />
                          <input
                            value={row.value}
                            onChange={(event) => updatePersonaAttributeRow(row.id, 'value', event.target.value)}
                            placeholder="维度描述（如：低）"
                            className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                          />
                          <button
                            onClick={() => removePersonaAttributeRow(row.id)}
                            disabled={personaDraftRows.length === 1 && index === 0 && !row.key.trim() && !row.value.trim()}
                            className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-600 disabled:opacity-40"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
                  <button
                    onClick={closePersonaModal}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
                  >
                    取消
                  </button>
                  <button
                    onClick={upsertPersona}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                  >
                    {personaModalMode === 'create' ? '创建并加入评测' : '保存修改'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="sticky bottom-3 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={goToPreviousStep}
                disabled={activeStep === 1}
                className="rounded-lg border border-slate-200 px-6 py-3 text-base font-semibold disabled:opacity-50"
              >
                上一步
              </button>
              <button
                onClick={goToNextStep}
                disabled={activeStep === 4 || !canGoNext}
                className="rounded-lg border border-slate-200 px-6 py-3 text-base font-semibold disabled:opacity-50"
                title={!canGoNext && activeStep !== 4 ? '请先完成当前步骤关键配置' : ''}
              >
                下一步
              </button>
              <button
                onClick={analyze}
                disabled={!canAnalyze || isAnalyzing}
                className="rounded-lg bg-slate-900 px-6 py-3 text-base font-semibold text-white disabled:opacity-50"
                title={!canAnalyze ? `还需完成：${missingGuidance.join('；')}` : ''}
              >
                {analyzeTargetLabel}
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
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setPageMode('landing')} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
                返回首页
              </button>
              <button onClick={() => setPageMode('setup')} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
                返回配置
              </button>
            </div>
          </header>

          <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {hasMultipleReports && (
                <button
                  onClick={() => {
                    if (uploadConfigMode === 'ab_test') {
                      setShowABSummary(true);
                    } else {
                      setShowSummary(true);
                    }
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs ${
                    uploadConfigMode === 'ab_test'
                      ? showABSummary
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200'
                      : showSummary
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200'
                  }`}
                >
                  综合报告
                </button>
              )}
              {(uploadConfigMode === 'ab_test' ? Object.keys(abComparisons) : Object.keys(reports)).map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    setViewingPersonaId(id);
                    setShowSummary(false);
                    setShowABSummary(false);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs ${
                    uploadConfigMode === 'ab_test'
                      ? !showABSummary && viewingPersonaId === id
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200'
                      : !showSummary && viewingPersonaId === id
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200'
                  }`}
                >
                  {personas.find((persona) => persona.id === id)?.name || id}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportCurrentReport}
                disabled={
                  isExporting ||
                  (uploadConfigMode === 'ab_test'
                    ? !showABSummary && !currentABComparison
                    : !showSummary && !currentReport)
                }
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50"
              >
                {isExporting ? '导出中...' : '导出当前报告 PNG'}
              </button>
              <button
                onClick={exportBatchReports}
                disabled={isBatchExporting || uploadConfigMode === 'ab_test' || Object.keys(reports).length === 0}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50"
                title={uploadConfigMode === 'ab_test' ? 'A/B 模式暂不支持批量 ZIP 导出' : ''}
              >
                {isBatchExporting ? '打包中...' : '导出全部报告 ZIP'}
              </button>
            </div>
          </div>

          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

          {uploadConfigMode === 'ab_test' ? (
            showABSummary && hasMultipleReports ? (
              <div ref={summaryCaptureRef} className="rounded-xl border border-slate-200 bg-white p-4">
                <ABSummaryReport comparisons={abComparisons} personas={personas} />
              </div>
            ) : currentABComparison ? (
              <div ref={reportCaptureRef} className="rounded-xl border border-slate-200 bg-white p-4">
                <ABReportView report={currentABComparison} />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                当前没有可展示的 A/B 对比报告，请返回配置并执行评测。
              </div>
            )
          ) : showSummary && hasMultipleReports ? (
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

      {uploadConfigMode === 'standard' && Object.keys(reports).length > 0 && (
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