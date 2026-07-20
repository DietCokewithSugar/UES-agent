import React, { useMemo, useRef, useState } from 'react';
import * as FileSaver from 'file-saver';
import {
  analyzeResearchResults,
  ClarifyOption,
  ClarifyResponse,
  ContentOutline,
  ExecutionGuideResult,
  generateExecutionGuide,
  generateResearchPlan,
  generateResearchQuestion,
  isDeepSeekConfigured,
  ProbingGuide,
  ResearchPlanResult,
  ResearchQuestionResult,
  ResearchSubPlan,
  ResultAnalysisReport,
  StageContext,
  StageKind
} from '../services/deepseekService';
import { extractTextFromFile } from '../utils/documentTextExtractor';
import { findSkillForMethod } from '../services/skills/skillRegistry';

interface AIExperienceCompanionProps {
  onBack: () => void;
}

type StageId = 1 | 2 | 3 | 4 | 5;

interface NeedsInput {
  needs: string;
  phase: string;
  problem: string;
}

interface ClarifyState<T> {
  question: string;
  options: ClarifyOption[];
  pending: boolean;
  error?: string;
  result?: T;
}

const STAGE_TITLES: Record<StageId, string> = {
  1: '收集需求',
  2: '研究问题',
  3: '研究方案',
  4: '执行指南',
  5: '结果分析'
};

const STAGE_SUBTITLES: Record<StageId, string> = {
  1: '告诉我你的产品、阶段和想搞清楚的问题',
  2: '我会把业务问题转化为研究问题',
  3: '我会推荐合适的研究方法、样本和周期',
  4: '生成完整执行指南，并准备好记录模板',
  5: '上传访谈/调研结果，由 AI 进行分析'
};

const saveFile = (data: Blob | string, filename: string) => {
  const save = (FileSaver as any).saveAs || (FileSaver as any).default || FileSaver;
  if (typeof save === 'function') save(data, filename);
};

const csvEscape = (value: string): string => {
  const v = (value ?? '').toString();
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
};

const buildCsv = (headers: string[], rows: string[][] = []): string => {
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach(row => lines.push(row.map(csvEscape).join(',')));
  return '\uFEFF' + lines.join('\r\n');
};

const downloadCsv = (filename: string, headers: string[], sampleRow?: string[]) => {
  const rows = sampleRow ? [sampleRow] : [];
  const csv = buildCsv(headers, rows);
  saveFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
};

const Bubble: React.FC<{ from: 'ai' | 'user'; children: React.ReactNode }> = ({ from, children }) => (
  <div className={`flex ${from === 'ai' ? 'justify-start' : 'justify-end'}`}>
    <div
      className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm border ${
        from === 'ai'
          ? 'bg-white border-slate-200 text-slate-800'
          : 'bg-slate-900 border-slate-900 text-white'
      }`}
    >
      {children}
    </div>
  </div>
);

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
    <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
    <div className="text-sm text-slate-700 leading-7 space-y-2">{children}</div>
  </div>
);

/** 研究内容概览（contentOutline）的紧凑展示：模块列表 + 核心探针 + 嵌入任务 */
const ContentOutlineView: React.FC<{ outline: ContentOutline }> = ({ outline }) => (
  <div className="space-y-1.5">
    {outline.sections.map((sec, i) => (
      <div key={i} className="rounded-md border border-slate-200 bg-white/70 px-2.5 py-1.5">
        <div className="text-xs font-semibold text-slate-800">
          {sec.title}
          {sec.duration ? (
            <span className="ml-1 font-normal text-slate-400">（{sec.duration}）</span>
          ) : null}
        </div>
        {sec.description ? (
          <div className="mt-0.5 text-[11px] leading-4 text-slate-600">{sec.description}</div>
        ) : null}
        {sec.probes && sec.probes.length > 0 && (
          <div className="mt-0.5 text-[11px] leading-4 text-slate-500">
            核心探针：{sec.probes.join('；')}
          </div>
        )}
      </div>
    ))}
    {outline.embedTask && (
      <div className="rounded-md border border-violet-200 bg-violet-50/60 px-2.5 py-1.5 text-[11px] leading-4 text-violet-800">
        <span className="font-semibold">嵌入任务 · {outline.embedTask.technique}：</span>
        {outline.embedTask.description}
      </div>
    )}
  </div>
);

/** 探询指南（interview-guide-generator）：追问三向仪 / ORID / 投射技术 / 特殊用户应对 */
const ProbingGuideView: React.FC<{ guide: ProbingGuide }> = ({ guide }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
    {guide.threeSixty && guide.threeSixty.length > 0 && (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-semibold text-slate-700">追问三向仪（360度提问法）</div>
        <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
          {guide.threeSixty.map((t, i) => (
            <li key={i}>
              <span className="font-semibold text-slate-800">{t.direction}</span>
              ：{t.usage}
              {t.example ? <span className="text-slate-400">（如："{t.example}"）</span> : null}
            </li>
          ))}
        </ul>
      </div>
    )}
    {guide.orid && guide.orid.length > 0 && (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-semibold text-slate-700">ORID 追问链</div>
        <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
          {guide.orid.map((o, i) => (
            <li key={i}>
              <span className="font-semibold text-slate-800">{o.level}</span>
              ：{(o.questions || []).join('；')}
            </li>
          ))}
        </ul>
      </div>
    )}
    {guide.projective && guide.projective.length > 0 && (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-semibold text-slate-700">投射技术速查</div>
        <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
          {guide.projective.map((p, i) => (
            <li key={i}>
              <span className="font-semibold text-slate-800">{p.technique}</span>
              ：{p.example}
            </li>
          ))}
        </ul>
      </div>
    )}
    {guide.specialUsers && guide.specialUsers.length > 0 && (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-semibold text-slate-700">特殊用户应对</div>
        <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
          {guide.specialUsers.map((u, i) => (
            <li key={i}>
              <span className="font-semibold text-slate-800">{u.userType}</span>
              ：{u.strategy}
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

const ClarifyPanel: React.FC<{
  question: string;
  options: ClarifyOption[];
  onSubmit: (selected: ClarifyOption[], customText: string) => void;
  onSkip: () => void;
  pending: boolean;
}> = (props) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [customText, setCustomText] = useState('');

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selected = props.options.filter(o => selectedIds.has(o.id));
  const canSubmit = (selected.length > 0 || customText.trim().length > 0) && !props.pending;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[11px] text-white">?</span>
        我需要先和你校准一下方向（可多选）
      </div>
      <p className="text-sm text-amber-900">{props.question}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {props.options.map(opt => {
          const checked = selectedIds.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              disabled={props.pending}
              onClick={() => toggle(opt.id)}
              aria-pressed={checked}
              className={`text-left rounded-lg p-3 transition-colors disabled:opacity-50 ${
                checked
                  ? 'border-2 border-amber-500 bg-amber-100/70 shadow-sm'
                  : 'border border-amber-200 bg-white hover:border-amber-400 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-amber-700">选项 {opt.id}</div>
                <span
                  className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                    checked
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-slate-300 bg-white text-transparent'
                  }`}
                  aria-hidden
                >
                  ✓
                </span>
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{opt.title}</div>
              <div className="mt-1 text-xs text-slate-600 leading-5">{opt.description}</div>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1">
        <label className="text-xs font-semibold text-slate-600">
          自定义补充（可选，可与上方选项同时勾选）
        </label>
        <textarea
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          rows={2}
          value={customText}
          placeholder="例如：我们更关心新用户首次使用场景，老用户暂不在范围内…"
          onChange={e => setCustomText(e.target.value)}
          disabled={props.pending}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-amber-800">
          {selected.length > 0
            ? `已选择 ${selected.length} 项：${selected.map(s => s.id).join(' / ')}${
                customText.trim() ? ' + 自定义补充' : ''
              }`
            : customText.trim()
            ? '仅使用自定义补充'
            : '至少勾选一个选项，或填写自定义补充'}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.onSkip}
            disabled={props.pending}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
          >
            跳过校准
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => props.onSubmit(selected, customText.trim())}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            提交所选方向
          </button>
        </div>
      </div>
    </div>
  );
};

const ConfirmActions: React.FC<{
  pending: boolean;
  onConfirm: () => void;
  onFeedback: (text: string) => void;
}> = ({ pending, onConfirm, onFeedback }) => {
  const [showFeedback, setShowFeedback] = useState(false);
  const [text, setText] = useState('');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onConfirm}
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          确认
        </button>
        <button
          onClick={() => setShowFeedback(s => !s)}
          disabled={pending}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
        >
          不太对，我补充一下
        </button>
      </div>
      {showFeedback && (
        <div className="rounded-lg border border-slate-300 bg-white p-3 space-y-2">
          <textarea
            rows={3}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="哪里不太对？请补充你的想法或限制条件…"
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div className="flex justify-end">
            <button
              disabled={!text.trim() || pending}
              onClick={() => {
                onFeedback(text.trim());
                setText('');
                setShowFeedback(false);
              }}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              重新生成
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const AIExperienceCompanion: React.FC<AIExperienceCompanionProps> = ({ onBack }) => {
  const [stage, setStage] = useState<StageId>(1);
  const [needs, setNeeds] = useState<NeedsInput>({ needs: '', phase: '', problem: '' });
  const [clarifications, setClarifications] = useState<{ stage: StageKind; summary: string }[]>([]);

  const [rqState, setRqState] = useState<ClarifyState<ResearchQuestionResult>>({
    question: '',
    options: [],
    pending: false
  });
  const [rpState, setRpState] = useState<ClarifyState<ResearchPlanResult>>({
    question: '',
    options: [],
    pending: false
  });
  // 步骤4 改为按子方案多 tab：state 为数组
  const [stage4Plans, setStage4Plans] = useState<ResearchSubPlan[]>([]);
  const [stage4UseFocus, setStage4UseFocus] = useState<boolean>(false);
  const [egStates, setEgStates] = useState<ClarifyState<ExecutionGuideResult>[]>([]);
  const [activeGuideIdx, setActiveGuideIdx] = useState<number>(0);

  const [confirmedResearchQuestion, setConfirmedResearchQuestion] = useState<string | undefined>(undefined);
  const [confirmedResearchPlan, setConfirmedResearchPlan] = useState<ResearchPlanResult | undefined>(undefined);
  // 步骤5 现在可能有多个执行指南（来自多个子方案）
  const [confirmedGuides, setConfirmedGuides] = useState<ExecutionGuideResult[]>([]);
  const [confirmedGuidePlans, setConfirmedGuidePlans] = useState<ResearchSubPlan[]>([]);
  const [activeConfirmedGuideIdx, setActiveConfirmedGuideIdx] = useState<number>(0);

  // 结果分析
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; content: string }[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analysisReport, setAnalysisReport] = useState<ResultAnalysisReport | null>(null);
  const [showGuideInStage5, setShowGuideInStage5] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const ctx: StageContext = useMemo(
    () => ({
      needs: needs.needs,
      phase: needs.phase,
      problem: needs.problem,
      clarifications,
      confirmedResearchQuestion,
      confirmedResearchPlan
    }),
    [needs, clarifications, confirmedResearchQuestion, confirmedResearchPlan]
  );

  const apiConfigured = isDeepSeekConfigured();

  // ===== Stage 流转 ===== //
  const runStage = async <T,>(
    stageKind: StageKind,
    fn: () => Promise<ClarifyResponse<T>>,
    setState: (updater: (prev: ClarifyState<T>) => ClarifyState<T>) => void
  ) => {
    setState(prev => ({ ...prev, pending: true, error: undefined }));
    try {
      const resp = await fn();
      if (resp.kind === 'clarify') {
        setState(prev => ({
          ...prev,
          pending: false,
          question: resp.clarification.question,
          options: resp.clarification.options,
          result: undefined
        }));
      } else {
        setState(prev => ({
          ...prev,
          pending: false,
          question: '',
          options: [],
          result: resp.result
        }));
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        pending: false,
        error: (err as Error).message || '请求失败'
      }));
    }
  };

  const startStage2 = async (overrideFeedback?: string) => {
    setStage(2);
    await runStage<ResearchQuestionResult>(
      'researchQuestion',
      () =>
        generateResearchQuestion({
          ...ctx,
          feedback: overrideFeedback
        }),
      setRqState
    );
  };

  const startStage3 = async (overrideFeedback?: string) => {
    setStage(3);
    await runStage<ResearchPlanResult>(
      'researchPlan',
      () => generateResearchPlan({ ...ctx, feedback: overrideFeedback }),
      setRpState
    );
  };

  /**
   * 根据已确认的研究方案，确定步骤 4 要分别生成多少份执行指南。
   * 组合方案 (mixed 且 subPlans>1) → 每个子方法一份；
   * 单方案 → 一份（不向 AI 强制 focusedPlan，保持原行为）。
   */
  const deriveStage4Plans = (
    plan?: ResearchPlanResult
  ): { plans: ResearchSubPlan[]; useFocus: boolean } => {
    if (!plan) return { plans: [], useFocus: false };
    const subs = (plan.subPlans || []).filter(s => s && s.method);
    if (subs.length > 1) {
      return { plans: subs, useFocus: true };
    }
    // 优先沿用模型返回的唯一子方案（保留 contentOutline / embeddedTechniques），
    // 只有完全缺失时才用顶层字段合成。
    const single: ResearchSubPlan = subs[0] ?? {
      method: plan.method,
      methodCategory:
        plan.methodCategory === 'mixed'
          ? 'other'
          : (plan.methodCategory as Exclude<typeof plan.methodCategory, 'mixed'>),
      sample: plan.sample,
      duration: plan.duration,
      purpose: '该研究的核心方法'
    };
    return { plans: [single], useFocus: false };
  };

  /** 为步骤 4 的第 idx 个子方案生成执行指南，写入 egStates[idx] */
  const loadGuideForIndex = async (
    idx: number,
    plans: ResearchSubPlan[],
    useFocus: boolean,
    overrideFeedback?: string
  ) => {
    if (idx < 0 || idx >= plans.length) return;
    setEgStates(prev => {
      const next = [...prev];
      next[idx] = {
        question: '',
        options: [],
        pending: true,
        error: undefined,
        result: undefined
      };
      return next;
    });
    try {
      const resp = await generateExecutionGuide(
        { ...ctx, feedback: overrideFeedback },
        useFocus ? plans[idx] : undefined
      );
      setEgStates(prev => {
        const next = [...prev];
        if (resp.kind === 'clarify') {
          next[idx] = {
            question: resp.clarification.question,
            options: resp.clarification.options,
            pending: false,
            result: undefined
          };
        } else {
          next[idx] = {
            question: '',
            options: [],
            pending: false,
            result: resp.result
          };
        }
        return next;
      });
    } catch (err) {
      setEgStates(prev => {
        const next = [...prev];
        next[idx] = {
          question: '',
          options: [],
          pending: false,
          error: (err as Error).message || '请求失败'
        };
        return next;
      });
    }
  };

  const startStage4 = async () => {
    setStage(4);
    const { plans, useFocus } = deriveStage4Plans(confirmedResearchPlan || rpState.result);
    setStage4Plans(plans);
    setStage4UseFocus(useFocus);
    setActiveGuideIdx(0);
    const initialStates: ClarifyState<ExecutionGuideResult>[] = plans.map(() => ({
      question: '',
      options: [],
      pending: false
    }));
    setEgStates(initialStates);
    if (plans.length > 0) {
      await loadGuideForIndex(0, plans, useFocus);
    }
  };

  const submitNeeds = async () => {
    if (!apiConfigured) {
      alert('请先在 .env.local 中配置 DEEPSEEK_API_KEY。');
      return;
    }
    if (!needs.needs.trim() && !needs.problem.trim()) {
      alert('请至少填写"产品/功能/需求"和"想搞清楚的问题"。');
      return;
    }
    await startStage2();
  };

  const handleClarifySubmit = async (
    stageKind: StageKind,
    selected: ClarifyOption[],
    customText: string,
    next: () => Promise<void>
  ) => {
    const parts: string[] = [];
    if (selected.length > 0) {
      parts.push(
        `用户同时选择了 ${selected.length} 个方向：` +
          selected
            .map(s => `【${s.id}】${s.title}（${s.description}）`)
            .join('；')
      );
    }
    if (customText.trim()) {
      parts.push(`用户补充：${customText.trim()}`);
    }
    const summary = parts.length > 0 ? parts.join(' / ') : '用户提交了空校准';
    setClarifications(prev => [...prev, { stage: stageKind, summary }]);
    await next();
  };

  const handleClarifySkip = async (
    stageKind: StageKind,
    next: () => Promise<void>
  ) => {
    const summary = `用户选择跳过校准，沿用 AI 当前理解`;
    setClarifications(prev => [...prev, { stage: stageKind, summary }]);
    await next();
  };

  // ===== Stage 5：上传分析 ===== //
  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setAnalyzeError(null);
    const collected: { name: string; content: string }[] = [];
    for (const file of Array.from(fileList)) {
      try {
        const text = await extractTextFromFile(file);
        collected.push({ name: file.name, content: text });
      } catch (err) {
        collected.push({
          name: file.name,
          content: `[文件解析失败：${(err as Error).message}]`
        });
      }
    }
    setUploadingFiles(prev => [...prev, ...collected]);
  };

  const runAnalysis = async () => {
    if (!apiConfigured) {
      alert('请先在 .env.local 中配置 DEEPSEEK_API_KEY。');
      return;
    }
    if (uploadingFiles.length === 0) {
      alert('请先上传至少一个研究结果文件。');
      return;
    }
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const combined = uploadingFiles
        .map(f => `## 文件：${f.name}\n${f.content}`)
        .join('\n\n');
      const report = await analyzeResearchResults({
        ctx,
        rawContent: combined,
        fileNames: uploadingFiles.map(f => f.name)
      });
      setAnalysisReport(report);
    } catch (err) {
      setAnalyzeError((err as Error).message || '分析失败');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const slugifyForFilename = (s: string): string =>
    s
      .replace(/[\s\\/:*?"<>|]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'guide';

  const downloadRecordTemplateFor = (
    guide: ExecutionGuideResult,
    plan?: ResearchSubPlan
  ) => {
    const cols = guide.recordTemplateColumns;
    if (!cols || cols.length === 0) {
      alert('该子方案暂无可用的记录模板字段。');
      return;
    }
    const sample = cols.map(c => `示例-${c}`);
    const fname = plan
      ? `record-template-${slugifyForFilename(plan.method)}.csv`
      : 'research-record-template.csv';
    downloadCsv(fname, cols, sample);
  };

  const buildOutlineMarkdownFor = (
    guide: ExecutionGuideResult,
    plan?: ResearchSubPlan
  ): string => {
    const lines: string[] = [];
    lines.push(`# 研究执行指南${plan ? `：${plan.method}` : ''}`);
    lines.push('');
    if (confirmedResearchQuestion) lines.push(`研究问题：${confirmedResearchQuestion}`);
    if (confirmedResearchPlan) {
      lines.push(`整体方案：${confirmedResearchPlan.method}`);
      lines.push(`整体样本：${confirmedResearchPlan.sample}`);
      lines.push(`整体周期：${confirmedResearchPlan.duration}`);
    }
    if (plan) {
      lines.push('');
      lines.push(`当前子方法：${plan.method}（${plan.methodCategory}）`);
      lines.push(`子方法样本：${plan.sample}`);
      lines.push(`子方法周期：${plan.duration}`);
      lines.push(`子方法目的：${plan.purpose}`);
    }
    lines.push('');
    lines.push(`## 一、用户招募`);
    lines.push(`样本规模：${guide.recruitment.totalSample}`);
    lines.push(guide.recruitment.summary);
    guide.recruitment.quotas.forEach(q => {
      lines.push(`- ${q.dimension}`);
      q.buckets.forEach(b => {
        lines.push(`  - ${b.label}：${b.count} 人${b.note ? `（${b.note}）` : ''}`);
      });
    });
    lines.push('筛选标准：');
    guide.recruitment.screeningCriteria.forEach(s => lines.push(`- ${s}`));
    lines.push('');
    lines.push(`## 二、访谈/调研提纲`);
    guide.outline.sections.forEach(s => {
      lines.push(
        `### ${s.name}（${s.duration}）${
          s.organizingMethod ? ` · ${s.organizingMethod}` : ''
        }`
      );
      s.questions.forEach((q, idx) => {
        if (q.leadIn) lines.push(`${idx + 1}. 铺垫：${q.leadIn}`);
        lines.push(
          `${q.leadIn ? '   ' : `${idx + 1}. `}[${q.topic}] ${q.question}${
            q.cbaType ? `（CBA：${q.cbaType}）` : ''
          }`
        );
        (q.followUps || []).forEach(f => lines.push(`   - 追问：${f}`));
        if (q.purpose) lines.push(`   - 目的：${q.purpose}`);
      });
    });
    lines.push('');
    lines.push(`## 三、执行注意事项`);
    guide.cautions.forEach(c => lines.push(`- ${c}`));
    const pg = guide.probingGuide;
    if (
      pg &&
      (pg.threeSixty?.length ||
        pg.orid?.length ||
        pg.projective?.length ||
        pg.specialUsers?.length)
    ) {
      lines.push('');
      lines.push(`## 四、探询指南`);
      if (pg.threeSixty?.length) {
        lines.push(`### 追问三向仪（360度提问法）`);
        pg.threeSixty.forEach(t =>
          lines.push(`- ${t.direction}：${t.usage}${t.example ? `（如："${t.example}"）` : ''}`)
        );
      }
      if (pg.orid?.length) {
        lines.push(`### ORID 追问链`);
        pg.orid.forEach(o => lines.push(`- ${o.level}：${(o.questions || []).join('；')}`));
      }
      if (pg.projective?.length) {
        lines.push(`### 投射技术速查`);
        pg.projective.forEach(p => lines.push(`- ${p.technique}：${p.example}`));
      }
      if (pg.specialUsers?.length) {
        lines.push(`### 特殊用户应对`);
        pg.specialUsers.forEach(u => lines.push(`- ${u.userType}：${u.strategy}`));
      }
    }
    lines.push('');
    lines.push(`## ${pg ? '五' : '四'}、记录模板字段`);
    guide.recordTemplateColumns.forEach(c => lines.push(`- ${c}`));
    return lines.join('\n');
  };

  const downloadOutlineFor = (
    guide: ExecutionGuideResult,
    plan?: ResearchSubPlan
  ) => {
    const md = buildOutlineMarkdownFor(guide, plan);
    const fname = plan
      ? `execution-guide-${slugifyForFilename(plan.method)}.md`
      : 'research-execution-guide.md';
    saveFile(
      new Blob([md], { type: 'text/markdown;charset=utf-8' }),
      fname
    );
  };

  const downloadAllOutlines = () => {
    if (confirmedGuides.length === 0) return;
    if (confirmedGuides.length === 1) {
      downloadOutlineFor(confirmedGuides[0], confirmedGuidePlans[0]);
      return;
    }
    const blocks = confirmedGuides.map((g, i) =>
      buildOutlineMarkdownFor(g, confirmedGuidePlans[i])
    );
    saveFile(
      new Blob([blocks.join('\n\n---\n\n')], { type: 'text/markdown;charset=utf-8' }),
      'research-execution-guide-all.md'
    );
  };

  // ===== 渲染辅助 ===== //
  const renderProgress = () => (
    <div className="flex items-center gap-2">
      {([1, 2, 3, 4, 5] as StageId[]).map((s, i) => {
        const completed = s < stage;
        const current = s === stage;
        return (
          <React.Fragment key={s}>
            <button
              onClick={() => {
                if (s <= stage) setStage(s);
              }}
              className="flex min-w-[72px] flex-col items-center gap-1 text-[11px]"
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                  completed
                    ? 'bg-emerald-500 text-white'
                    : current
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {completed ? '✓' : s}
              </span>
              <span className={current ? 'text-slate-900 font-semibold' : 'text-slate-500'}>
                {STAGE_TITLES[s]}
              </span>
            </button>
            {i < 4 && (
              <div className="h-1 flex-1 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: s < stage ? '100%' : s === stage ? '50%' : '0%' }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  const renderStage1 = () => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 space-y-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-sm font-semibold">
          AI
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">
            您好，我是您的 AI 体验伙伴小研，让我帮您一起完成体验工作吧。
          </p>
          <p className="text-sm text-slate-600">
            请填写以下三项信息，我会基于您的回答帮您把业务问题转化成研究问题，并推荐研究方案。
          </p>
        </div>
      </div>

      <div className="space-y-3 md:pl-12">
        <div>
          <label className="text-xs font-semibold text-slate-700">
            1. 您现在要做一个什么产品 / 功能 / 需求？
          </label>
          <textarea
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={2}
            placeholder="例如：一款面向小微企业的财税 SaaS 中的发票识别功能"
            value={needs.needs}
            onChange={e => setNeeds(n => ({ ...n, needs: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">
            2. 这个产品 / 功能 / 需求现在处于什么阶段？
          </label>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="例如：概念验证 / Demo 测试 / 上线 3 个月 / 体验下滑"
            value={needs.phase}
            onChange={e => setNeeds(n => ({ ...n, phase: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">
            3. 您希望搞清楚什么问题？
          </label>
          <textarea
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={3}
            placeholder="例如：为什么核心转化漏斗中第二步流失率特别高？"
            value={needs.problem}
            onChange={e => setNeeds(n => ({ ...n, problem: e.target.value }))}
          />
        </div>
        <div className="flex justify-end pt-1">
          <button
            onClick={submitNeeds}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
          >
            提交，让 AI 开始分析
          </button>
        </div>
      </div>
    </div>
  );

  const renderClarifyOrResult = <T,>(
    state: ClarifyState<T>,
    stageKind: StageKind,
    retry: () => Promise<void>,
    renderResult: (result: T) => React.ReactNode,
    onConfirm: () => void,
    onFeedback: (text: string) => Promise<void>
  ) => {
    if (state.pending) {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          <span className="inline-block animate-pulse">AI 正在思考中…</span>
        </div>
      );
    }
    if (state.error) {
      return (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 space-y-2">
          <p className="text-sm text-rose-700">{state.error}</p>
          <button
            onClick={retry}
            className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs text-rose-700"
          >
            重试
          </button>
        </div>
      );
    }
    if (state.options.length > 0 && !state.result) {
      return (
        <ClarifyPanel
          question={state.question}
          options={state.options}
          pending={state.pending}
          onSubmit={(selected, customText) =>
            handleClarifySubmit(stageKind, selected, customText, retry)
          }
          onSkip={() => handleClarifySkip(stageKind, retry)}
        />
      );
    }
    if (state.result) {
      return (
        <div className="space-y-3">
          {renderResult(state.result)}
          <ConfirmActions
            pending={state.pending}
            onConfirm={onConfirm}
            onFeedback={onFeedback}
          />
        </div>
      );
    }
    return null;
  };

  const renderStage2 = () =>
    renderClarifyOrResult<ResearchQuestionResult>(
      rqState,
      'researchQuestion',
      () => startStage2(),
      result => (
        <SectionCard title="将您的业务问题转化为研究问题">
          <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 text-violet-900">
            <span className="text-xs font-semibold">核心研究问题（研究问题陈述）</span>
            <p className="mt-1 text-sm font-medium leading-7">{result.researchQuestion}</p>
          </div>
          {result.clarifiedDimensions && result.clarifiedDimensions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-600">已澄清的维度</div>
              <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {result.clarifiedDimensions.map((d, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-semibold text-slate-700">{d.dimension}：</span>
                    <span className="text-slate-600">{d.conclusion}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.subQuestions?.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-600">细分研究问题</div>
              <ul className="mt-1 list-disc pl-5 space-y-1 text-sm">
                {result.subQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="text-xs text-slate-500 leading-6">
            <span className="font-semibold">为什么这样转化：</span>
            {result.rationale}
          </div>
        </SectionCard>
      ),
      () => {
        if (!rqState.result) return;
        setConfirmedResearchQuestion(rqState.result.researchQuestion);
        startStage3();
      },
      async (feedback: string) => {
        await startStage2(feedback);
      }
    );

  const renderStage3 = () =>
    renderClarifyOrResult<ResearchPlanResult>(
      rpState,
      'researchPlan',
      () => startStage3(),
      result => {
        const hasSubPlans = !!result.subPlans && result.subPlans.length > 1;
        const singleSubPlan =
          result.subPlans && result.subPlans.length === 1 ? result.subPlans[0] : undefined;
        return (
          <SectionCard title="推荐的研究方案">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">方法</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{result.method}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {result.methodCategory === 'mixed' && (
                    <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                      组合方案
                    </span>
                  )}
                  {result.researchType && (
                    <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                      {result.researchType}
                    </span>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">样本</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{result.sample}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">周期</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{result.duration}</div>
              </div>
            </div>

            {!hasSubPlans && singleSubPlan && (singleSubPlan.contentOutline || singleSubPlan.embeddedTechniques?.length) ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs font-semibold text-slate-600">研究内容概览</div>
                  {singleSubPlan.embeddedTechniques?.map((t, i) => (
                    <span
                      key={i}
                      className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700"
                    >
                      嵌入技术 · {t}
                    </span>
                  ))}
                </div>
                {singleSubPlan.contentOutline && (
                  <ContentOutlineView outline={singleSubPlan.contentOutline} />
                )}
              </div>
            ) : null}

            {hasSubPlans && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-600">
                  方案中的子方法（步骤 4 将分别生成执行指南）
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {result.subPlans!.map((sp, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-900">
                          {i + 1}. {sp.method}
                        </div>
                        <span className="text-[10px] rounded-full bg-white px-2 py-0.5 border border-slate-200 text-slate-500">
                          {sp.methodCategory}
                        </span>
                      </div>
                      <div className="text-xs text-slate-700">
                        <span className="text-slate-500">样本：</span>
                        {sp.sample}
                      </div>
                      <div className="text-xs text-slate-700">
                        <span className="text-slate-500">周期：</span>
                        {sp.duration}
                      </div>
                      <div className="text-xs text-slate-600 leading-5">
                        <span className="text-slate-500">目的：</span>
                        {sp.purpose}
                      </div>
                      {sp.embeddedTechniques && sp.embeddedTechniques.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {sp.embeddedTechniques.map((t, k) => (
                            <span
                              key={k}
                              className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700"
                            >
                              嵌入技术 · {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {sp.contentOutline && (
                        <div className="pt-1">
                          <div className="text-[11px] font-semibold text-slate-500">
                            研究内容概览
                          </div>
                          <div className="mt-1">
                            <ContentOutlineView outline={sp.contentOutline} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-sm text-slate-700 leading-7">
              <span className="text-xs font-semibold text-slate-500">为什么推荐这个方案：</span>
              <p className="mt-1">{result.rationale}</p>
            </div>
            {result.alternatives?.length ? (
              <div className="text-xs text-slate-500">
                备选方案：{result.alternatives.join('；')}
              </div>
            ) : null}
            {result.limitations?.length ? (
              <div className="text-xs text-slate-500">
                <span className="font-semibold">方案局限性：</span>
                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                  {result.limitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SectionCard>
        );
      },
      () => {
        if (!rpState.result) return;
        setConfirmedResearchPlan(rpState.result);
        startStage4();
      },
      async (feedback: string) => {
        await startStage3(feedback);
      }
    );

  const renderGuideBody = (result: ExecutionGuideResult) => (
    <div className="space-y-3">
      <SectionCard title="一、用户招募">
        <p>
          <span className="text-xs font-semibold text-slate-500">样本规模：</span>
          {result.recruitment.totalSample} 人
        </p>
        <p>{result.recruitment.summary}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {result.recruitment.quotas.map((q, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              <div className="text-xs font-semibold text-slate-700">
                配额维度：{q.dimension}
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {q.buckets.map((b, i) => (
                  <li key={i}>
                    {b.label}：{b.count} 人
                    {b.note ? (
                      <span className="text-xs text-slate-500"> · {b.note}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {result.recruitment.screeningCriteria?.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-500">筛选标准</div>
            <ul className="mt-1 list-disc pl-5 space-y-1">
              {result.recruitment.screeningCriteria.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>
      <SectionCard title="二、访谈/调研提纲">
        {result.outline.sections.map((s, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-slate-900">{s.name}</div>
                {s.organizingMethod && (
                  <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                    {s.organizingMethod}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500">{s.duration}</div>
            </div>
            <ol className="list-decimal pl-5 space-y-2 text-sm">
              {s.questions.map((q, j) => (
                <li key={j}>
                  {q.leadIn && (
                    <div className="text-xs text-slate-500">铺垫：{q.leadIn}</div>
                  )}
                  <div>
                    <span className="text-xs text-slate-500">[{q.topic}] </span>
                    {q.question}
                    {q.cbaType && (
                      <span className="ml-1 inline-flex rounded border border-slate-300 bg-white px-1 text-[10px] font-semibold text-slate-500 align-middle">
                        {q.cbaType}
                      </span>
                    )}
                  </div>
                  {q.followUps && q.followUps.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs text-slate-600 space-y-0.5">
                      {q.followUps.map((f, k) => (
                        <li key={k}>追问：{f}</li>
                      ))}
                    </ul>
                  )}
                  {q.purpose && (
                    <div className="mt-0.5 text-[11px] text-slate-400">目的：{q.purpose}</div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </SectionCard>
      <SectionCard title="三、执行注意事项">
        <ul className="list-disc pl-5 space-y-1">
          {result.cautions.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </SectionCard>
      {result.probingGuide &&
        (result.probingGuide.threeSixty?.length ||
          result.probingGuide.orid?.length ||
          result.probingGuide.projective?.length ||
          result.probingGuide.specialUsers?.length) ? (
        <SectionCard title="四、探询指南（访谈中的导航仪）">
          <ProbingGuideView guide={result.probingGuide} />
        </SectionCard>
      ) : null}
      {result.recordTemplateColumns?.length > 0 && (
        <SectionCard title={result.probingGuide ? '五、记录模板' : '四、记录模板'}>
          <p>建议使用如下字段记录访谈/调研结果（可直接下载 CSV 表格）：</p>
          <div className="flex flex-wrap gap-1">
            {result.recordTemplateColumns.map((c, i) => (
              <span
                key={i}
                className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs"
              >
                {c}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={() => {
                const sample = result.recordTemplateColumns.map(c => `示例-${c}`);
                downloadCsv(
                  'research-record-template.csv',
                  result.recordTemplateColumns,
                  sample
                );
              }}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white"
            >
              下载记录模板（CSV）
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );

  const renderStage4 = () => {
    if (stage4Plans.length === 0) {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          正在准备子方案…
        </div>
      );
    }

    const activeState = egStates[activeGuideIdx];
    const activePlan = stage4Plans[activeGuideIdx];
    const totalGenerated = egStates.filter(s => !!s?.result).length;
    const allGenerated = totalGenerated === stage4Plans.length;

    const confirmAll = () => {
      if (!allGenerated) return;
      const guides = egStates.map(s => s.result!).filter(Boolean);
      setConfirmedGuides(guides);
      setConfirmedGuidePlans(stage4Plans);
      setActiveConfirmedGuideIdx(0);
      setStage(5);
    };

    const retryActive = async () => {
      await loadGuideForIndex(activeGuideIdx, stage4Plans, stage4UseFocus);
    };

    const reloadActiveWithFeedback = async (feedback: string) => {
      await loadGuideForIndex(activeGuideIdx, stage4Plans, stage4UseFocus, feedback);
    };

    return (
      <div className="space-y-3">
        {stage4Plans.length > 1 && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-700">
                组合方案：分别为每个子方法生成执行指南
              </div>
              <div className="text-[11px] text-slate-500">
                已生成 {totalGenerated} / {stage4Plans.length}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stage4Plans.map((sp, i) => {
                const s = egStates[i];
                const isActive = i === activeGuideIdx;
                const status = s?.pending
                  ? '生成中'
                  : s?.error
                  ? '失败'
                  : s?.result
                  ? '已生成'
                  : s?.options?.length
                  ? '待校准'
                  : '未生成';
                const statusColor = s?.pending
                  ? 'bg-slate-100 text-slate-500'
                  : s?.error
                  ? 'bg-rose-100 text-rose-600'
                  : s?.result
                  ? 'bg-emerald-100 text-emerald-700'
                  : s?.options?.length
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-500';
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={async () => {
                      setActiveGuideIdx(i);
                      const target = egStates[i];
                      if (!target?.result && !target?.pending && !target?.options?.length) {
                        await loadGuideForIndex(i, stage4Plans, stage4UseFocus);
                      }
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs border transition-colors ${
                      isActive
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <span className="font-semibold">{i + 1}. {sp.method}</span>
                    <span className={`ml-2 inline-flex rounded-full px-1.5 py-0.5 text-[10px] ${statusColor}`}>
                      {status}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-slate-500">
              提示：每个子方法的招募样本量、提纲与记录模板都是独立的。切换 Tab 单独检查、可单独"重新生成"。
            </div>
          </div>
        )}

        {activePlan && (
          <div className="rounded-xl border border-slate-200 bg-violet-50/40 p-3 text-xs text-violet-900 space-y-1">
            <div>
              <span className="font-semibold">当前子方法：</span>
              {activePlan.method}
              <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500 border border-slate-200">
                {activePlan.methodCategory}
              </span>
            </div>
            <div>
              <span className="font-semibold">独立样本：</span>
              {activePlan.sample}
              <span className="mx-2 text-slate-400">·</span>
              <span className="font-semibold">独立周期：</span>
              {activePlan.duration}
            </div>
            <div>
              <span className="font-semibold">在整体研究中的角色：</span>
              {activePlan.purpose}
            </div>
            {(() => {
              const skill = findSkillForMethod(activePlan.methodCategory, activePlan.method);
              return skill ? (
                <div className="pt-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                    ⚡ 由「{skill.name}」技能驱动
                  </span>
                </div>
              ) : null;
            })()}
          </div>
        )}

        {activeState?.pending ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            <span className="inline-block animate-pulse">AI 正在为该子方案生成执行指南…</span>
          </div>
        ) : activeState?.error ? (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 space-y-2">
            <p className="text-sm text-rose-700">{activeState.error}</p>
            <button
              onClick={retryActive}
              className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs text-rose-700"
            >
              重试
            </button>
          </div>
        ) : activeState?.options?.length && !activeState.result ? (
          <ClarifyPanel
            question={activeState.question}
            options={activeState.options}
            pending={!!activeState.pending}
            onSubmit={(selected, customText) =>
              handleClarifySubmit('executionGuide', selected, customText, retryActive)
            }
            onSkip={() => handleClarifySkip('executionGuide', retryActive)}
          />
        ) : activeState?.result ? (
          <div className="space-y-3">
            {renderGuideBody(activeState.result)}
            <ConfirmActions
              pending={!!activeState.pending}
              onConfirm={() => {
                if (stage4Plans.length === 1) {
                  confirmAll();
                  return;
                }
                if (allGenerated) {
                  confirmAll();
                } else {
                  const nextIdx = egStates.findIndex(s => !s?.result);
                  if (nextIdx >= 0 && nextIdx !== activeGuideIdx) {
                    setActiveGuideIdx(nextIdx);
                    const target = egStates[nextIdx];
                    if (!target?.result && !target?.pending && !target?.options?.length) {
                      void loadGuideForIndex(nextIdx, stage4Plans, stage4UseFocus);
                    }
                  }
                }
              }}
              onFeedback={reloadActiveWithFeedback}
            />
            {stage4Plans.length > 1 && allGenerated && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-emerald-800">
                  所有子方案的执行指南均已生成。
                </p>
                <button
                  onClick={confirmAll}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  全部确认，进入结果分析阶段
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 flex items-center justify-between">
            <span>该子方案尚未生成执行指南。</span>
            <button
              onClick={retryActive}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white"
            >
              生成此子方案的执行指南
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderStage5 = () => {
    const multiGuide = confirmedGuides.length > 1;
    const activeGuide = confirmedGuides[activeConfirmedGuideIdx];
    const activePlan = confirmedGuidePlans[activeConfirmedGuideIdx];
    return (
    <div className="space-y-4">
      <Bubble from="ai">
        现在{multiGuide ? `${confirmedGuides.length} 份 ` : ''}执行指南已经就绪。完成线下访谈/调研后，把记录文件上传给我，我会基于研究问题与方案进行结构化分析，整理出关键发现、痛点、机会点和下一步建议。
      </Bubble>
      {confirmedGuides.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setShowGuideInStage5(v => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
            aria-expanded={showGuideInStage5}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-slate-600 text-xs transition-transform ${
                  showGuideInStage5 ? 'rotate-90' : ''
                }`}
                aria-hidden
              >
                ▶
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  查看完整执行指南（含访谈提纲与记录模板下载）
                  {multiGuide && (
                    <span className="ml-2 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                      {confirmedGuides.length} 份子方案
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {multiGuide
                    ? '组合研究：每个子方法都有独立的招募配额、提纲与记录模板。按对应模板填写后再上传，分析会更准。'
                    : '在这里再次核对招募配额、提纲与记录字段，下载 CSV 记录模板，按模板填写后再上传。'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                onClick={e => {
                  e.stopPropagation();
                  downloadAllOutlines();
                }}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    downloadAllOutlines();
                  }
                }}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
              >
                {multiGuide ? '下载全部 Markdown' : '下载 Markdown'}
              </span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                {showGuideInStage5 ? '收起' : '展开'}
              </span>
            </div>
          </button>
          {showGuideInStage5 && (
            <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-3">
              {multiGuide && (
                <div className="flex flex-wrap gap-1.5">
                  {confirmedGuides.map((_, i) => {
                    const isActive = i === activeConfirmedGuideIdx;
                    const plan = confirmedGuidePlans[i];
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveConfirmedGuideIdx(i)}
                        className={`rounded-lg px-3 py-1.5 text-xs border transition-colors ${
                          isActive
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                        }`}
                      >
                        {i + 1}. {plan?.method || `子方案 ${i + 1}`}
                      </button>
                    );
                  })}
                </div>
              )}
              {activeGuide && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-slate-500">
                      当前查看：
                      <span className="font-semibold text-slate-800 ml-1">
                        {activePlan?.method || '研究执行指南'}
                      </span>
                      {activePlan && (
                        <>
                          <span className="mx-2 text-slate-400">·</span>
                          独立样本 {activePlan.sample}
                          <span className="mx-2 text-slate-400">·</span>
                          周期 {activePlan.duration}
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => downloadOutlineFor(activeGuide, activePlan)}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                      >
                        下载这一份的 Markdown
                      </button>
                      <button
                        onClick={() => downloadRecordTemplateFor(activeGuide, activePlan)}
                        className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] text-white"
                      >
                        下载这一份的记录模板（CSV）
                      </button>
                    </div>
                  </div>
                  {renderGuideBody(activeGuide)}
                </>
              )}
            </div>
          )}
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="text-sm font-semibold text-slate-900">上传研究结果</div>
        <p className="text-xs text-slate-500">
          支持 .txt / .csv / .md / .docx / .pdf 等格式。可一次上传多份，例如多个受访者的访谈记录或问卷导出文件。
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.csv,.md,.markdown,.docx,.pdf"
          onChange={e => handleFiles(e.target.files)}
          className="text-sm"
        />
        {uploadingFiles.length > 0 && (
          <ul className="text-xs text-slate-700 space-y-1">
            {uploadingFiles.map((f, i) => (
              <li key={i} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1">
                <span>{f.name}</span>
                <button
                  onClick={() => setUploadingFiles(prev => prev.filter((_, idx) => idx !== i))}
                  className="text-rose-500 text-xs"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={runAnalysis}
            disabled={isAnalyzing || uploadingFiles.length === 0}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isAnalyzing ? 'AI 分析中…' : '开始 AI 分析'}
          </button>
          {analysisReport && (
            <button
              onClick={() => setAnalysisReport(null)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm"
            >
              清空分析结果
            </button>
          )}
        </div>
        {analyzeError && (
          <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {analyzeError}
          </div>
        )}
      </div>
      {analysisReport && (
        <div className="space-y-3">
          <SectionCard title="研究结果摘要">
            <p>{analysisReport.executiveSummary}</p>
          </SectionCard>
          {analysisReport.keyFindings?.length > 0 && (
            <SectionCard title="关键发现">
              <ul className="space-y-2">
                {analysisReport.keyFindings.map((f, i) => (
                  <li key={i} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-sm font-semibold text-slate-900">{f.title}</div>
                    <p className="text-sm text-slate-700 mt-1">{f.description}</p>
                    {f.evidence && f.evidence.length > 0 && (
                      <ul className="mt-1 text-xs text-slate-500 list-disc pl-5">
                        {f.evidence.map((e, j) => (
                          <li key={j}>证据：{e}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          {analysisReport.userSegments && analysisReport.userSegments.length > 0 && (
            <SectionCard title="用户分群">
              <ul className="space-y-1">
                {analysisReport.userSegments.map((s, i) => (
                  <li key={i}>
                    <span className="font-semibold">{s.name}：</span>
                    {s.description}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          {analysisReport.painPoints?.length > 0 && (
            <SectionCard title="痛点列表">
              <ul className="space-y-1">
                {analysisReport.painPoints.map((p, i) => (
                  <li key={i} className="flex flex-wrap items-start gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        p.severity === '高'
                          ? 'bg-rose-100 text-rose-700'
                          : p.severity === '中'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {p.severity}
                    </span>
                    <span className="flex-1">
                      {p.issue}
                      {p.evidence ? (
                        <span className="text-xs text-slate-500"> · 证据：{p.evidence}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          {analysisReport.opportunities?.length > 0 && (
            <SectionCard title="机会点 / 设计方向">
              <ul className="space-y-1">
                {analysisReport.opportunities.map((o, i) => (
                  <li key={i}>
                    <span className="font-semibold">{o.idea}：</span>
                    {o.rationale}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          {analysisReport.nextSteps?.length > 0 && (
            <SectionCard title="下一步建议">
              <ol className="list-decimal pl-5 space-y-1">
                {analysisReport.nextSteps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </SectionCard>
          )}
          {analysisReport.unansweredQuestions?.length > 0 && (
            <SectionCard title="尚未回答 / 需要进一步验证">
              <ul className="list-disc pl-5 space-y-1">
                {analysisReport.unansweredQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      )}
    </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-4xl p-4 md:p-6 space-y-4">
        <header className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] text-violet-700">
                AI 体验伙伴 · DeepSeek 驱动
              </span>
              <h1 className="text-xl font-semibold">设计你的用户研究</h1>
              <p className="text-sm text-slate-600">
                当前阶段：{STAGE_TITLES[stage]} · {STAGE_SUBTITLES[stage]}
              </p>
            </div>
            <button
              onClick={onBack}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              返回首页
            </button>
          </div>
          {!apiConfigured && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              提示：未检测到 <code>DEEPSEEK_API_KEY</code>，请在项目根目录的 <code>.env.local</code> 中配置后重新启动开发服务。
            </div>
          )}
          {renderProgress()}
        </header>

        <main className="space-y-4">
          {stage === 1 && renderStage1()}
          {stage === 2 && (
            <div className="space-y-3">
              <Bubble from="user">
                我要做的是：{needs.needs || '（未填写）'}。当前阶段：{needs.phase || '（未填写）'}。
                我想搞清楚：{needs.problem || '（未填写）'}。
              </Bubble>
              {renderStage2()}
            </div>
          )}
          {stage === 3 && (
            <div className="space-y-3">
              <Bubble from="ai">
                已确认研究问题：
                <p className="mt-1 font-semibold">{confirmedResearchQuestion}</p>
              </Bubble>
              {renderStage3()}
            </div>
          )}
          {stage === 4 && (
            <div className="space-y-3">
              {confirmedResearchPlan && (
                <Bubble from="ai">
                  已确认研究方案：{confirmedResearchPlan.method} · {confirmedResearchPlan.sample} · {confirmedResearchPlan.duration}
                </Bubble>
              )}
              {renderStage4()}
            </div>
          )}
          {stage === 5 && renderStage5()}
        </main>
      </div>
    </div>
  );
};

export default AIExperienceCompanion;
