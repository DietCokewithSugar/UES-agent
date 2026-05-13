import React, { useMemo, useRef, useState } from 'react';
import * as FileSaver from 'file-saver';
import {
  analyzeResearchResults,
  ClarifyOption,
  ClarifyResponse,
  ExecutionGuideResult,
  generateExecutionGuide,
  generateResearchPlan,
  generateResearchQuestion,
  isDeepSeekConfigured,
  ResearchPlanResult,
  ResearchQuestionResult,
  ResultAnalysisReport,
  StageContext,
  StageKind
} from '../services/deepseekService';
import { extractTextFromFile } from '../utils/documentTextExtractor';

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

const ClarifyPanel = <T,>(props: {
  question: string;
  options: ClarifyOption[];
  onChoose: (chosen: ClarifyOption) => void;
  onCustom: (text: string) => void;
  onSkip: () => void;
  pending: boolean;
}) => {
  const [customText, setCustomText] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[11px] text-white">?</span>
        我需要先和你校准一下方向
      </div>
      <p className="text-sm text-amber-900">{props.question}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {props.options.map(opt => (
          <button
            key={opt.id}
            disabled={props.pending}
            onClick={() => props.onChoose(opt)}
            className="text-left rounded-lg border border-amber-200 bg-white p-3 hover:border-amber-400 hover:shadow-sm disabled:opacity-50"
          >
            <div className="text-xs font-semibold text-amber-700">选项 {opt.id}</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{opt.title}</div>
            <div className="mt-1 text-xs text-slate-600 leading-5">{opt.description}</div>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {!showCustom ? (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowCustom(true)}
              disabled={props.pending}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            >
              D. 我自己来描述
            </button>
            <button
              onClick={props.onSkip}
              disabled={props.pending}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            >
              跳过校准，按 AI 自己的理解继续
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-300 bg-white p-3 space-y-2">
            <textarea
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              rows={3}
              value={customText}
              placeholder="请用一两句话告诉我你的真实方向…"
              onChange={e => setCustomText(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowCustom(false);
                  setCustomText('');
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                disabled={props.pending}
              >
                取消
              </button>
              <button
                disabled={!customText.trim() || props.pending}
                onClick={() => props.onCustom(customText.trim())}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                提交
              </button>
            </div>
          </div>
        )}
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
  const [egState, setEgState] = useState<ClarifyState<ExecutionGuideResult>>({
    question: '',
    options: [],
    pending: false
  });

  const [confirmedResearchQuestion, setConfirmedResearchQuestion] = useState<string | undefined>(undefined);
  const [confirmedResearchPlan, setConfirmedResearchPlan] = useState<ResearchPlanResult | undefined>(undefined);
  const [confirmedGuide, setConfirmedGuide] = useState<ExecutionGuideResult | undefined>(undefined);

  // 结果分析
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; content: string }[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analysisReport, setAnalysisReport] = useState<ResultAnalysisReport | null>(null);
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

  const startStage4 = async (overrideFeedback?: string) => {
    setStage(4);
    await runStage<ExecutionGuideResult>(
      'executionGuide',
      () => generateExecutionGuide({ ...ctx, feedback: overrideFeedback }),
      setEgState
    );
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

  const handleClarifyChoose = async (
    stageKind: StageKind,
    chosen: ClarifyOption,
    next: () => Promise<void>
  ) => {
    const summary = `用户选择了【${chosen.id}】${chosen.title}：${chosen.description}`;
    setClarifications(prev => [...prev, { stage: stageKind, summary }]);
    await next();
  };

  const handleClarifyCustom = async (
    stageKind: StageKind,
    text: string,
    next: () => Promise<void>
  ) => {
    const summary = `用户自行补充：${text}`;
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

  const downloadRecordTemplate = () => {
    const cols = confirmedGuide?.recordTemplateColumns;
    if (!cols || cols.length === 0) {
      alert('暂无可用的记录模板字段。');
      return;
    }
    const sample = cols.map(c => `示例-${c}`);
    downloadCsv('research-record-template.csv', cols, sample);
  };

  const downloadOutline = () => {
    if (!confirmedGuide) return;
    const lines: string[] = [];
    lines.push(`# 研究执行指南`);
    lines.push('');
    if (confirmedResearchQuestion) lines.push(`研究问题：${confirmedResearchQuestion}`);
    if (confirmedResearchPlan) {
      lines.push(`研究方法：${confirmedResearchPlan.method}`);
      lines.push(`样本：${confirmedResearchPlan.sample}`);
      lines.push(`周期：${confirmedResearchPlan.duration}`);
    }
    lines.push('');
    lines.push(`## 一、用户招募`);
    lines.push(`样本规模：${confirmedGuide.recruitment.totalSample}`);
    lines.push(confirmedGuide.recruitment.summary);
    confirmedGuide.recruitment.quotas.forEach(q => {
      lines.push(`- ${q.dimension}`);
      q.buckets.forEach(b => {
        lines.push(`  - ${b.label}：${b.count} 人${b.note ? `（${b.note}）` : ''}`);
      });
    });
    lines.push('筛选标准：');
    confirmedGuide.recruitment.screeningCriteria.forEach(s => lines.push(`- ${s}`));
    lines.push('');
    lines.push(`## 二、访谈/调研提纲`);
    confirmedGuide.outline.sections.forEach(s => {
      lines.push(`### ${s.name}（${s.duration}）`);
      s.questions.forEach((q, idx) => {
        lines.push(`${idx + 1}. [${q.topic}] ${q.question}`);
        (q.followUps || []).forEach(f => lines.push(`   - 追问：${f}`));
      });
    });
    lines.push('');
    lines.push(`## 三、执行注意事项`);
    confirmedGuide.cautions.forEach(c => lines.push(`- ${c}`));
    saveFile(
      new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }),
      'research-execution-guide.md'
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
    <div className="space-y-4">
      <Bubble from="ai">
        <p className="font-semibold text-slate-900">您好，我是您的 AI 体验伙伴小研，让我帮您一起完成体验工作吧。</p>
        <p className="mt-2">请先告诉我以下几个信息，以便我更好地帮助您：</p>
        <ol className="mt-1 list-decimal pl-5 space-y-1">
          <li>您现在要做一个什么产品/功能/需求？</li>
          <li>这个产品/功能/需求现在处于什么阶段？</li>
          <li>您希望搞清楚什么问题？</li>
        </ol>
      </Bubble>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-700">
            1. 产品 / 功能 / 需求
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
          <label className="text-xs font-semibold text-slate-700">2. 所处阶段</label>
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
        <div className="flex justify-end">
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
          onChoose={chosen =>
            handleClarifyChoose(stageKind, chosen, retry)
          }
          onCustom={text => handleClarifyCustom(stageKind, text, retry)}
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
            <span className="text-xs font-semibold">核心研究问题</span>
            <p className="mt-1 text-sm font-medium leading-7">{result.researchQuestion}</p>
          </div>
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
      result => (
        <SectionCard title="推荐的研究方案">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">方法</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{result.method}</div>
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
          <div className="text-sm text-slate-700 leading-7">
            <span className="text-xs font-semibold text-slate-500">为什么推荐这个方案：</span>
            <p className="mt-1">{result.rationale}</p>
          </div>
          {result.alternatives?.length ? (
            <div className="text-xs text-slate-500">
              备选方案：{result.alternatives.join('；')}
            </div>
          ) : null}
        </SectionCard>
      ),
      () => {
        if (!rpState.result) return;
        setConfirmedResearchPlan(rpState.result);
        startStage4();
      },
      async (feedback: string) => {
        await startStage3(feedback);
      }
    );

  const renderStage4 = () =>
    renderClarifyOrResult<ExecutionGuideResult>(
      egState,
      'executionGuide',
      () => startStage4(),
      result => (
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
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">{s.name}</div>
                  <div className="text-xs text-slate-500">{s.duration}</div>
                </div>
                <ol className="list-decimal pl-5 space-y-2 text-sm">
                  {s.questions.map((q, j) => (
                    <li key={j}>
                      <div>
                        <span className="text-xs text-slate-500">[{q.topic}] </span>
                        {q.question}
                      </div>
                      {q.followUps && q.followUps.length > 0 && (
                        <ul className="mt-1 list-disc pl-5 text-xs text-slate-600 space-y-0.5">
                          {q.followUps.map((f, k) => (
                            <li key={k}>追问：{f}</li>
                          ))}
                        </ul>
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
          {result.recordTemplateColumns?.length > 0 && (
            <SectionCard title="四、记录模板">
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
      ),
      () => {
        if (!egState.result) return;
        setConfirmedGuide(egState.result);
        setStage(5);
      },
      async (feedback: string) => {
        await startStage4(feedback);
      }
    );

  const renderStage5 = () => (
    <div className="space-y-4">
      <Bubble from="ai">
        现在执行指南已经就绪。完成线下访谈/调研后，把记录文件上传给我，我会基于研究问题与方案进行结构化分析，整理出关键发现、痛点、机会点和下一步建议。
      </Bubble>
      {confirmedGuide && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="text-sm font-semibold text-slate-900">资料下载</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadOutline}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            >
              下载执行指南（Markdown）
            </button>
            <button
              onClick={downloadRecordTemplate}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            >
              下载记录模板（CSV）
            </button>
          </div>
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
