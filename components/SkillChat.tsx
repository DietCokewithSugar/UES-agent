import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentDefinition, HandoffContext, Proposal } from '../services/agents/types';
import { isDeepSeekConfigured } from '../services/deepseekService';
import {
  collectAttachments,
  countClarifyRounds,
  nextId,
  toDeepSeekMessages,
  type ChatMessage,
  type ClarifyAnswer
} from '../services/uxkit/chatHistory';
import { derivePlanDeliverables } from '../services/uxkit/uxkitOrchestrator';
import type {
  Deliverable,
  GeneratedDoc,
  IntentSummary,
  SkillTrace
} from '../services/uxkit/types';
import { readAttachments, type Attachment } from '../utils/attachments';
import {
  clearAllSessions,
  deleteSession,
  getSession,
  listSessions,
  newSessionId,
  saveSession,
  type StoredSession
} from '../utils/chatHistoryStorage';
import { ClarifyCard } from './uxkit/ClarifyCard';
import { Composer } from './uxkit/Composer';
import { DocumentCard } from './uxkit/DocumentCard';
import { HistoryPanel } from './uxkit/HistoryPanel';
import { HandoffCard } from './uxkit/HandoffCard';
import { IntentCard } from './uxkit/IntentCard';
import { ProposalCard } from './uxkit/ProposalCard';
import { SkillTraceChip } from './uxkit/SkillTrace';

/** 流式输出时 messages 每个分片都在变，写 localStorage 要防抖，否则会疯狂写盘。 */
const SAVE_DEBOUNCE_MS = 800;

export interface HandoffPayload {
  /** 从 ux-kit 的需求确认卡带过来的精简研究背景 */
  context: HandoffContext;
}

interface Props {
  agent: AgentDefinition;
  onBack: () => void;
  /** ux-kit 产出材料后跳到分析助手时，把研究背景带过来 */
  handoff?: HandoffPayload;
  /** 消费掉 handoff，避免开新对话时被重复注入 */
  onHandoffConsumed?: () => void;
  /** ux-kit 产出材料后，提供"去做分析"的入口 */
  onGoToAnalysis?: (handoff: HandoffPayload) => void;
}

const Bubble: React.FC<{ from: 'ai' | 'user'; children: React.ReactNode }> = ({
  from,
  children
}) => (
  <div className={`flex ${from === 'ai' ? 'justify-start' : 'justify-end'}`}>
    <div
      className={`max-w-[90%] rounded-2xl border px-4 py-3 text-sm leading-6 shadow-sm ${
        from === 'ai'
          ? 'border-slate-200 bg-white text-slate-800'
          : 'border-slate-900 bg-slate-900 text-white'
      }`}
    >
      {children}
    </div>
  </div>
);

const HeaderButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({
  onClick,
  children
}) => (
  <button
    onClick={onClick}
    className="rounded-lg px-2.5 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-800"
  >
    {children}
  </button>
);

/**
 * 通用的技能对话外壳。
 *
 * 消息模型、输入框、历史抽屉、技能轨迹、卡片渲染都在这里；
 * 具体走什么流程由传入的 `agent` 决定（ux-kit 设计研究材料 / ux-analysis 分析数据）。
 *
 * **上下文独立性**：每条会话有独立的 `messages`，`toDeepSeekMessages` 只摊平当前会话，
 * 开新对话会换 sessionId 并清空全部状态——所以新窗口没有记忆；
 * 从历史打开旧会话会把 messages / intent / planMarkdown 一起还原，接着聊就有上下文。
 */
export const SkillChat: React.FC<Props> = ({
  agent,
  onBack,
  handoff,
  onHandoffConsumed,
  onGoToAnalysis
}) => {
  const [sessionId, setSessionId] = useState(newSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<IntentSummary | undefined>();
  const [planMarkdown, setPlanMarkdown] = useState<string | undefined>();

  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [parsingFiles, setParsingFiles] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<StoredSession[]>([]);

  const sessionIdRef = useRef(sessionId);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const configured = isDeepSeekConfigured();

  const [skillError, setSkillError] = useState<string | null>(null);

  const refreshSessions = useCallback(
    () => setSessions(listSessions(agent.id)),
    [agent.id]
  );
  useEffect(refreshSessions, [refreshSessions]);

  // 切换技能入口时彻底重置，绝不把上一个技能的会话带过来
  useEffect(() => {
    abortRef.current?.abort();
    const id = newSessionId();
    sessionIdRef.current = id;
    setSessionId(id);
    setMessages([]);
    setIntent(undefined);
    setPlanMarkdown(undefined);
    setPendingFiles([]);
    setInput('');
    setBusy(false);
    setSkillError(null);
  }, [agent.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // 防抖落盘：流式产出期间不会每个分片都写一次
  useEffect(() => {
    if (messages.length === 0) return;
    const timer = window.setTimeout(() => {
      saveSession({ id: sessionId, agentId: agent.id, messages, intent, planMarkdown });
      refreshSessions();
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [messages, intent, planMarkdown, sessionId, agent.id, refreshSessions]);

  const push = useCallback((msg: ChatMessage) => setMessages(prev => [...prev, msg]), []);
  const patch = useCallback(
    (id: string, updater: (m: ChatMessage) => ChatMessage) =>
      setMessages(prev => prev.map(m => (m.id === id ? updater(m) : m))),
    []
  );

  const newAbort = () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    return ctrl.signal;
  };

  const pushError = useCallback(
    (err: unknown) => {
      const message = (err as Error)?.message ?? String(err);
      push({
        id: nextId('err'),
        role: 'assistant',
        kind: 'error',
        message: /abort/i.test(message) ? '已停止生成。' : message
      });
    },
    [push]
  );

  const buildCtx = useCallback(
    (
      history: ChatMessage[],
      signal?: AbortSignal,
      onTrace?: (trace: SkillTrace) => void
    ) => ({
      history: toDeepSeekMessages(history),
      attachments: collectAttachments(history),
      rounds: countClarifyRounds(history),
      intent,
      planMarkdown,
      milestones: {
        hasHandoff: history.some(m => m.kind === 'handoff'),
        confirmedIntent: history.some(m => m.kind === 'intent' && m.status === 'confirmed'),
        confirmedProposals: history
          .filter(m => m.kind === 'proposal' && m.status === 'confirmed')
          .map(m => (m.kind === 'proposal' ? m.proposal.title : '')),
        confirmedProposalPurposes: history
          .filter(m => m.kind === 'proposal' && m.status === 'confirmed')
          .map(m => (m.kind === 'proposal' ? m.proposal.purpose : undefined))
          .filter((purpose): purpose is NonNullable<Proposal['purpose']> => Boolean(purpose))
      },
      signal,
      onTrace
    }),
    [intent, planMarkdown]
  );

  // ===== 控制轮 ===== //

  const runControl = useCallback(
    async (history: ChatMessage[]) => {
      const turnSessionId = sessionIdRef.current;
      setBusy(true);
      const signal = newAbort();
      const traceId = nextId('trace');
      try {
        push({
          id: traceId,
          role: 'assistant',
          kind: 'trace',
          running: true,
          trace: {
            skillId: agent.skillId,
            skillName: agent.skillId,
            phase: '正在思考下一步',
            templates: [],
            references: [],
            steps: [
              {
                id: 'start',
                kind: 'thinking',
                label: '理解请求',
                detail: '正在结合当前对话判断下一步',
                status: 'running'
              }
            ]
          }
        });

        const onTrace = (trace: SkillTrace) => {
          if (sessionIdRef.current !== turnSessionId) return;
          patch(traceId, m => (m.kind === 'trace' ? { ...m, trace, running: true } : m));
        };
        const { action, trace } = await agent.runControlTurn(buildCtx(history, signal, onTrace));
        if (sessionIdRef.current !== turnSessionId) return;
        patch(traceId, m => (m.kind === 'trace' ? { ...m, trace, running: false } : m));

        switch (action.action) {
          case 'ask':
            push({
              id: nextId('ask'),
              role: 'assistant',
              kind: 'clarify',
              question: action.question,
              options: action.options,
              multiple: action.multiple,
              note: action.note
            });
            break;
          case 'intent':
            setIntent(action.intent);
            push({
              id: nextId('intent'),
              role: 'assistant',
              kind: 'intent',
              intent: action.intent,
              status: 'pending'
            });
            break;
          case 'propose':
            push({
              id: nextId('prop'),
              role: 'assistant',
              kind: 'proposal',
              proposal: action.proposal,
              status: 'pending'
            });
            break;
          case 'request_files':
            push({
              id: nextId('files'),
              role: 'assistant',
              kind: 'request_files',
              prompt: action.prompt,
              hint: action.hint
            });
            break;
          case 'generate':
            setBusy(false);
            for (const d of action.deliverables) {
              const doc = await generateDoc(history, d);
              if (!doc) break;
            }
            return;
          case 'done':
            push({ id: nextId('a'), role: 'assistant', kind: 'text', text: action.text });
            break;
        }
      } catch (err) {
        if (sessionIdRef.current !== turnSessionId) return;
        patch(traceId, m =>
          m.kind === 'trace'
            ? {
                ...m,
                running: false,
                trace: {
                  ...m.trace,
                  summary: '本轮执行未完成，请查看下方错误并重试。',
                  steps: m.trace.steps?.map(step =>
                    step.status === 'running'
                      ? { ...step, status: 'error' as const, detail: '调用未完成' }
                      : step
                  )
                }
              }
            : m
        );
        pushError(err);
      } finally {
        if (sessionIdRef.current === turnSessionId) setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agent, buildCtx, patch, push, pushError]
  );

  // ===== 产出轮 ===== //

  const generateDoc = useCallback(
    async (
      history: ChatMessage[],
      deliverable: Deliverable,
      opts: { feedback?: string } = {}
    ): Promise<GeneratedDoc | null> => {
      const turnSessionId = sessionIdRef.current;
      setBusy(true);
      const signal = newAbort();
      const traceId = nextId('trace');
      const docId = nextId('doc');

      push({
        id: traceId,
        role: 'assistant',
        kind: 'trace',
        running: true,
        trace: {
          skillId: agent.skillId,
          skillName: agent.skillId,
          phase: '正在准备产出',
          templates: [],
          references: [],
          steps: [
            {
              id: 'start',
              kind: 'thinking',
              label: '准备生成',
              detail: `正在规划《${deliverable.filename}》`,
              status: 'running'
            }
          ]
        }
      });
      push({
        id: docId,
        role: 'assistant',
        kind: 'document',
        streaming: true,
        format: 'markdown',
        doc: { id: docId, kind: deliverable.kind, filename: deliverable.filename, markdown: '' }
      });

      try {
        let acc = '';
        const { raw, format, truncated, trace } = await agent.runGenerateTurn(
          buildCtx(history, signal),
          deliverable,
          {
            feedback: opts.feedback,
            signal,
            onTrace: trace => {
              if (sessionIdRef.current !== turnSessionId) return;
              patch(traceId, m => (m.kind === 'trace' ? { ...m, trace, running: true } : m));
            },
            onDelta: chunk => {
              if (sessionIdRef.current !== turnSessionId) return;
              acc += chunk;
              patch(docId, m =>
                m.kind === 'document' ? { ...m, doc: { ...m.doc, markdown: acc } } : m
              );
            }
          }
        );

        if (sessionIdRef.current !== turnSessionId) return null;
        patch(traceId, m => (m.kind === 'trace' ? { ...m, trace, running: false } : m));
        const doc: GeneratedDoc = {
          id: docId,
          kind: deliverable.kind,
          filename: deliverable.filename,
          markdown: raw,
          truncated
        };
        patch(docId, m =>
          m.kind === 'document'
            ? {
                ...m,
                doc,
                format,
                streaming: false,
                // ux-kit 的研究方案要等用户确认后才按阶段出材料
                awaitingConfirm: agent.id === 'ux-kit' && deliverable.kind === 'researchPlan',
                // ux-kit 产出的是研究材料，产出后引导去做分析
                offerAnalysis: agent.id === 'ux-kit' && deliverable.kind !== 'researchPlan'
              }
            : m
        );
        return doc;
      } catch (err) {
        if (sessionIdRef.current !== turnSessionId) return null;
        setMessages(prev => prev.filter(m => m.id !== docId));
        patch(traceId, m =>
          m.kind === 'trace'
            ? {
                ...m,
                running: false,
                trace: {
                  ...m.trace,
                  summary: '文档生成未完成，请查看下方错误并重试。',
                  steps: m.trace.steps?.map(step =>
                    step.status === 'running'
                      ? { ...step, status: 'error' as const, detail: '生成中断' }
                      : step
                  )
                }
              }
            : m
        );
        pushError(err);
        return null;
      } finally {
        if (sessionIdRef.current === turnSessionId) setBusy(false);
      }
    },
    [agent, buildCtx, patch, push, pushError]
  );

  // ===== 交互回调 ===== //

  const addFiles = async (files: File[]) => {
    const targetSessionId = sessionIdRef.current;
    setParsingFiles(true);
    try {
      const parsed = await readAttachments(files);
      if (sessionIdRef.current !== targetSessionId) return;
      setPendingFiles(prev => [...prev, ...parsed]);
    } finally {
      if (sessionIdRef.current === targetSessionId) setParsingFiles(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && pendingFiles.length === 0) || busy) return;
    const msg: ChatMessage = {
      id: nextId('u'),
      role: 'user',
      kind: 'text',
      text: text || `（上传了 ${pendingFiles.length} 个文件）`,
      attachments: pendingFiles.length ? pendingFiles : undefined
    };
    const history = [...messages, msg];
    setMessages(history);
    setInput('');
    setPendingFiles([]);
    await runControl(history);
  };

  const handleClarifyAnswer = async (msgId: string, answer: ClarifyAnswer) => {
    const answered = messages.map(m =>
      m.id === msgId && m.kind === 'clarify' ? { ...m, answer } : m
    );
    const history: ChatMessage[] = [
      ...answered,
      { id: nextId('u'), role: 'user', kind: 'answer', answer }
    ];
    setMessages(history);
    await runControl(history);
  };

  const handleProposalConfirm = async (msgId: string) => {
    const confirmed = messages.map(m =>
      m.id === msgId && m.kind === 'proposal' ? { ...m, status: 'confirmed' as const } : m
    );
    setMessages(confirmed);
    await runControl(confirmed);
  };

  const handleFeedback = async (sourceId: string, feedback: string) => {
    const superseded = messages.map(m =>
      m.id === sourceId &&
      ((m.kind === 'intent' && m.status === 'pending') ||
        (m.kind === 'proposal' && m.status === 'pending'))
        ? { ...m, status: 'superseded' as const }
        : m
    );
    const history: ChatMessage[] = [
      ...superseded,
      { id: nextId('u'), role: 'user', kind: 'text', text: feedback }
    ];
    setMessages(history);
    await runControl(history);
  };

  const handleIntentConfirm = async (msgId: string, confirmed: IntentSummary) => {
    const next = messages.map(m =>
      m.id === msgId && m.kind === 'intent' ? { ...m, status: 'confirmed' as const } : m
    );
    setMessages(next);
    setIntent(confirmed);
    const doc = await generateDoc(next, confirmed.deliverables[0]);
    if (doc && confirmed.mode === 'plan') setPlanMarkdown(doc.markdown);
  };

  const handlePlanRevise = async (feedback: string) => {
    if (!intent) return;
    const history: ChatMessage[] = [
      ...messages,
      { id: nextId('u'), role: 'user', kind: 'text', text: feedback }
    ];
    setMessages(history);
    const doc = await generateDoc(history, intent.deliverables[0], { feedback });
    if (doc) setPlanMarkdown(doc.markdown);
  };

  const handlePlanConfirm = async (msgId: string) => {
    if (!intent || !planMarkdown) return;
    const targetSessionId = sessionIdRef.current;
    patch(msgId, m => (m.kind === 'document' ? { ...m, awaitingConfirm: false } : m));

    setBusy(true);
    let deliverables: Deliverable[] = [];
    try {
      deliverables = await derivePlanDeliverables(intent, planMarkdown, { signal: newAbort() });
      if (sessionIdRef.current !== targetSessionId) return;
    } catch (err) {
      if (sessionIdRef.current !== targetSessionId) return;
      pushError(err);
      setBusy(false);
      return;
    }
    if (sessionIdRef.current !== targetSessionId) return;
    setBusy(false);

    if (deliverables.length === 0) {
      push({
        id: nextId('a'),
        role: 'assistant',
        kind: 'text',
        text: '这份方案里没有需要单独出文件的阶段（用户声音分析的计划已经内嵌在方案里了）。方案本身就是最终交付物。'
      });
      return;
    }

    push({
      id: nextId('a'),
      role: 'assistant',
      kind: 'text',
      text: `方案已确认，接下来按阶段生成 ${deliverables.length} 份材料：${deliverables
        .map(d => d.filename)
        .join('、')}`
    });

    for (const d of deliverables) {
      // 串行：每份材料都要看到已确认的方案，且避免并发把上下文打乱
      const doc = await generateDoc(messages, d);
      if (!doc) break;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setBusy(false);
  };

  // ===== 会话管理 ===== //

  const persistCurrent = () => {
    if (messages.length > 0) {
      saveSession({ id: sessionId, agentId: agent.id, messages, intent, planMarkdown });
    }
  };

  const resetTo = (id: string) => {
    sessionIdRef.current = id;
    setSessionId(id);
    setMessages([]);
    setIntent(undefined);
    setPlanMarkdown(undefined);
    setPendingFiles([]);
    setInput('');
    setBusy(false);
  };

  const startNewChat = () => {
    abortRef.current?.abort();
    persistCurrent();
    resetTo(newSessionId());
    refreshSessions();
  };

  const openSession = (id: string) => {
    if (id === sessionId) {
      setHistoryOpen(false);
      return;
    }
    abortRef.current?.abort();
    persistCurrent();
    const stored = getSession(id);
    if (!stored) return;
    resetTo(stored.id);
    setMessages(stored.messages);
    setIntent(stored.intent);
    setPlanMarkdown(stored.planMarkdown);
    setHistoryOpen(false);
    refreshSessions();
  };

  const removeSession = (id: string) => {
    deleteSession(id);
    if (id === sessionId) resetTo(newSessionId());
    refreshSessions();
  };

  const clearHistory = () => {
    clearAllSessions(agent.id);
    resetTo(newSessionId());
    setHistoryOpen(false);
    refreshSessions();
  };

  // ===== 技能衔接：从 ux-kit 带研究背景过来 ===== //

  useEffect(() => {
    if (!handoff || messages.length > 0) return;
    const msg: ChatMessage = {
      id: nextId('u'),
      role: 'user',
      kind: 'handoff',
      handoff: handoff.context
    };
    setMessages([msg]);
    onHandoffConsumed?.();
    void runControl([msg]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff, agent.id, messages.length]);

  // ===== 渲染 ===== //

  const renderMessage = (m: ChatMessage) => {
    switch (m.kind) {
      case 'text':
        return (
          <Bubble key={m.id} from={m.role === 'user' ? 'user' : 'ai'}>
            <div className="whitespace-pre-wrap">{m.text}</div>
            {m.role === 'user' && m.attachments && m.attachments.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-white/20 pt-2">
                {m.attachments.map(a => (
                  <div key={a.id} className="flex items-center gap-1.5 text-[11px] opacity-80">
                    <span>📎</span>
                    <span className="truncate">{a.name}</span>
                    {a.note && <span className="flex-none opacity-70">· {a.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </Bubble>
        );

      case 'handoff':
        return (
          <div key={m.id} className="flex justify-start">
            <div className="w-full max-w-[92%]">
              <HandoffCard handoff={m.handoff} />
            </div>
          </div>
        );

      case 'answer':
        return (
          <Bubble key={m.id} from="user">
            <div className="whitespace-pre-wrap">
              {m.answer.skipped
                ? '跳过这一问'
                : [
                    m.answer.selected.map(s => s.title).join(' / '),
                    m.answer.custom && `补充：${m.answer.custom}`
                  ]
                    .filter(Boolean)
                    .join('\n')}
            </div>
          </Bubble>
        );

      case 'clarify':
        return (
          <div key={m.id} className="flex justify-start">
            <div className="w-full max-w-[92%]">
              <ClarifyCard
                question={m.question}
                options={m.options}
                multiple={m.multiple}
                note={m.note}
                answer={m.answer}
                pending={busy}
                onSubmit={answer => handleClarifyAnswer(m.id, answer)}
              />
            </div>
          </div>
        );

      case 'proposal':
        return (
          <div key={m.id} className="flex justify-start">
            <div className="w-full max-w-[92%]">
              <ProposalCard
                proposal={m.proposal}
                status={m.status}
                pending={busy}
                onConfirm={() => handleProposalConfirm(m.id)}
                onRevise={feedback => handleFeedback(m.id, feedback)}
              />
            </div>
          </div>
        );

      case 'request_files':
        return (
          <div key={m.id} className="flex justify-start">
            <div className="max-w-[92%] rounded-xl border border-slate-300 border-dashed bg-white px-4 py-3">
              <div className="text-sm text-slate-800">{m.prompt}</div>
              {m.hint && <div className="mt-1 text-xs text-slate-500">{m.hint}</div>}
              <div className="mt-2 text-[11px] text-slate-400">
                用下方输入框左侧的回形针添加文件，或直接把文件拖进来。
              </div>
            </div>
          </div>
        );

      case 'intent':
        return (
          <div key={m.id} className="flex justify-start">
            <div className="w-full max-w-[92%]">
              <IntentCard
                intent={m.intent}
                status={m.status}
                pending={busy}
                onConfirm={() => handleIntentConfirm(m.id, m.intent)}
                onRevise={feedback => handleFeedback(m.id, feedback)}
              />
            </div>
          </div>
        );

      case 'document':
        return (
          <div key={m.id} className="flex justify-start">
            <div className="w-full max-w-[92%] space-y-2">
              <DocumentCard
                doc={m.doc}
                format={m.format}
                streaming={m.streaming}
                awaitingConfirm={m.awaitingConfirm}
                pending={busy}
                onConfirm={() => handlePlanConfirm(m.id)}
                onRevise={handlePlanRevise}
              />
              {m.offerAnalysis && onGoToAnalysis && !m.streaming && (
                <button
                  onClick={() =>
                    onGoToAnalysis({
                      context: {
                        source: 'ux-kit',
                        statement: intent?.statement || `分析《${m.doc.filename}》对应的研究数据`,
                        subject: intent?.subject,
                        audience: intent?.audience,
                        intent: intent?.intent,
                        constraints: intent?.constraints
                      }
                    })
                  }
                  className="w-full rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-left text-sm text-sky-900 transition-colors hover:bg-sky-100"
                >
                  <span className="font-semibold">数据回来了？去做分析 →</span>
                  <span className="ml-1.5 text-xs text-sky-700">
                    带着这次的研究背景开一条分析助手的新对话
                  </span>
                </button>
              )}
            </div>
          </div>
        );

      case 'trace':
        return <SkillTraceChip key={m.id} trace={m.trace} running={m.running} />;

      case 'error':
        return (
          <div key={m.id} className="flex justify-start">
            <div className="max-w-[90%] rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {m.message}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const blocked = !configured || Boolean(skillError);
  const isEmpty = messages.length === 0;
  const hasRunningTrace = messages.some(m => m.kind === 'trace' && m.running);

  const composerFooter = (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-violet-100 text-[9px] font-bold text-violet-700">
        S
      </span>
      <span className="font-mono text-slate-500">{agent.skillId}</span>
      <span className="text-slate-300">/</span>
      <span>DeepSeek</span>
    </span>
  );

  const composer = (
    <Composer
      value={input}
      onChange={setInput}
      onSend={handleSend}
      onStop={stop}
      busy={busy}
      disabled={blocked}
      autoFocus={isEmpty}
      placeholder={isEmpty ? agent.composer.emptyPlaceholder : agent.composer.placeholder}
      footer={composerFooter}
      attachments={pendingFiles}
      onAddFiles={agent.composer.acceptsFiles ? addFiles : undefined}
      onRemoveAttachment={id => setPendingFiles(prev => prev.filter(a => a.id !== id))}
      accept={agent.composer.accept}
      parsing={parsingFiles}
    />
  );

  const banners = (
    <>
      {skillError && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
          {skillError}
        </div>
      )}
      {!configured && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          尚未配置 <code className="font-mono">DEEPSEEK_API_KEY</code>
          。请在项目根目录的 <code className="font-mono">.env.local</code> 里填好后重启开发服务。
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <HistoryPanel
        open={historyOpen}
        sessions={sessions}
        activeId={sessionId}
        title={`${agent.nav.title} · 历史对话`}
        onClose={() => setHistoryOpen(false)}
        onOpenSession={openSession}
        onDeleteSession={removeSession}
        onClearAll={clearHistory}
      />

      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 md:px-6">
        <header className="flex items-center justify-between gap-2 py-3">
          <div className="flex items-center gap-1">
            <HeaderButton onClick={() => setHistoryOpen(true)}>
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
                  <path
                    d="M2.5 4h11M2.5 8h11M2.5 12h7"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
                历史{sessions.length > 0 ? ` (${sessions.length})` : ''}
              </span>
            </HeaderButton>
            <span className="text-xs text-slate-400">{agent.nav.title}</span>
          </div>
          <div className="flex items-center gap-1">
            {!isEmpty && <HeaderButton onClick={startNewChat}>新对话</HeaderButton>}
            <HeaderButton onClick={onBack}>返回首页</HeaderButton>
          </div>
        </header>

        {isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center pb-24">
            <div className="w-full space-y-6">
              <div className="select-none text-center">
                <div
                  className="font-display text-6xl font-extrabold tracking-tight text-slate-900/[0.06] md:text-7xl"
                  aria-hidden
                >
                  {agent.nav.wordmark}
                </div>
                <h1 className="-mt-3 text-lg font-semibold tracking-tight text-slate-800 md:text-xl">
                  {agent.nav.chatHeading || agent.nav.title}
                </h1>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                  {agent.nav.intro}
                </p>
              </div>

              <div className="space-y-3">
                {banners}
                {composer}
              </div>

              <p className="text-center text-[11px] text-slate-400">
                产出为 .docx · 对话仅保存在你自己的浏览器里
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 pb-4">
              {banners}
              {messages.map(renderMessage)}
              {busy && !hasRunningTrace && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                    <span className="inline-block animate-pulse">AI 正在思考中…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-4 pb-4 pt-6 md:-mx-6 md:px-6">
              {composer}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SkillChat;
