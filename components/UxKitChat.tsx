import React, { useCallback, useEffect, useRef, useState } from 'react';

import { isDeepSeekConfigured } from '../services/deepseekService';
import {
  countClarifyRounds,
  nextId,
  toDeepSeekMessages,
  type ChatMessage,
  type ClarifyAnswer
} from '../services/uxkit/chatHistory';
import {
  derivePlanDeliverables,
  getUxKitSkill,
  runControlTurn,
  runGenerateTurn
} from '../services/uxkit/uxkitOrchestrator';
import type { Deliverable, GeneratedDoc, IntentSummary } from '../services/uxkit/types';
import { ClarifyCard } from './uxkit/ClarifyCard';
import { DocumentCard } from './uxkit/DocumentCard';
import { IntentCard } from './uxkit/IntentCard';
import { SkillTraceChip } from './uxkit/SkillTrace';

interface Props {
  onBack: () => void;
}

const EXAMPLES = [
  '帮我编一个外卖 App 的满意度问卷',
  '做一份新版首页的可用性测试方案',
  '帮我调研一下用户对会员权益的看法'
];

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

/**
 * 对话式的 ux-kit 体验。
 *
 * 把 `skills/ux-kit` 技能"套壳"成一场对话：
 *   用户一句话 → AI 追问（多选卡）→ AI 归纳意图（确认卡）→ 用户确认 → 产出 .docx
 *
 * 用户明确指定了产出物时（"我要编一个 XX 问卷"），Phase 0 判定为问卷/提纲/可用性模式，
 * 确认后**直接产出材料，没有研究方案这一步**；诉求模糊或涉及多种材料时走方案模式，
 * 先出研究方案、确认后再按阶段生成材料。
 */
export const UxKitChat: React.FC<Props> = ({ onBack }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<IntentSummary | undefined>();
  const [planMarkdown, setPlanMarkdown] = useState<string | undefined>();

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const configured = isDeepSeekConfigured();

  // 技能没装好属于部署问题，早点说清楚，别等到第一次调用才报错
  const [skillError, setSkillError] = useState<string | null>(null);
  useEffect(() => {
    try {
      getUxKitSkill();
    } catch (err) {
      setSkillError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

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
      if (/abort/i.test(message)) {
        push({ id: nextId('err'), role: 'assistant', kind: 'error', message: '已停止生成。' });
        return;
      }
      push({ id: nextId('err'), role: 'assistant', kind: 'error', message });
    },
    [push]
  );

  // ===== 控制轮：Phase 0 模式识别 + Phase 1 澄清 ===== //

  const runControl = useCallback(
    async (history: ChatMessage[]) => {
      setBusy(true);
      const signal = newAbort();
      const traceId = nextId('trace');
      try {
        const skill = getUxKitSkill();
        push({
          id: traceId,
          role: 'assistant',
          kind: 'trace',
          running: true,
          trace: {
            skillId: skill.id,
            skillName: skill.name,
            phase: 'Phase 0/1 模式识别与问题澄清',
            templates: [],
            references: []
          }
        });

        const { action, trace } = await runControlTurn(toDeepSeekMessages(history), {
          roundsSoFar: countClarifyRounds(history),
          signal
        });

        patch(traceId, m => (m.kind === 'trace' ? { ...m, trace, running: false } : m));

        if (action.action === 'ask') {
          push({
            id: nextId('ask'),
            role: 'assistant',
            kind: 'clarify',
            question: action.question,
            options: action.options,
            note: action.note
          });
        } else {
          setIntent(action.intent);
          push({
            id: nextId('intent'),
            role: 'assistant',
            kind: 'intent',
            intent: action.intent,
            status: 'pending'
          });
        }
      } catch (err) {
        setMessages(prev => prev.filter(m => m.id !== traceId));
        pushError(err);
      } finally {
        setBusy(false);
      }
    },
    [patch, push, pushError]
  );

  // ===== 产出轮：流式生成一份材料 ===== //

  const generateDoc = useCallback(
    async (
      target: IntentSummary,
      deliverable: Deliverable,
      opts: { planMarkdown?: string; feedback?: string } = {}
    ): Promise<GeneratedDoc | null> => {
      setBusy(true);
      const signal = newAbort();
      const traceId = nextId('trace');
      const docId = nextId('doc');
      const skill = getUxKitSkill();

      push({
        id: traceId,
        role: 'assistant',
        kind: 'trace',
        running: true,
        trace: {
          skillId: skill.id,
          skillName: skill.name,
          phase: '正在准备产出',
          templates: [],
          references: []
        }
      });
      push({
        id: docId,
        role: 'assistant',
        kind: 'document',
        streaming: true,
        doc: { id: docId, kind: deliverable.kind, filename: deliverable.filename, markdown: '' }
      });

      try {
        let acc = '';
        const { markdown, truncated, trace } = await runGenerateTurn(target, deliverable, {
          ...opts,
          signal,
          onDelta: chunk => {
            acc += chunk;
            patch(docId, m =>
              m.kind === 'document' ? { ...m, doc: { ...m.doc, markdown: acc } } : m
            );
          }
        });

        patch(traceId, m => (m.kind === 'trace' ? { ...m, trace, running: false } : m));
        const doc: GeneratedDoc = {
          id: docId,
          kind: deliverable.kind,
          filename: deliverable.filename,
          markdown,
          truncated
        };
        patch(docId, m =>
          m.kind === 'document'
            ? {
                ...m,
                doc,
                streaming: false,
                awaitingConfirm: deliverable.kind === 'researchPlan'
              }
            : m
        );
        return doc;
      } catch (err) {
        setMessages(prev => prev.filter(m => m.id !== traceId && m.id !== docId));
        pushError(err);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [patch, push, pushError]
  );

  // ===== 交互回调 ===== //

  const handleSend = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const msg: ChatMessage = { id: nextId('u'), role: 'user', kind: 'text', text };
    const history = [...messages, msg];
    setMessages(history);
    setInput('');
    await runControl(history);
  };

  const handleClarifyAnswer = async (msgId: string, answer: ClarifyAnswer) => {
    const answered = messages.map(m => (m.id === msgId && m.kind === 'clarify' ? { ...m, answer } : m));
    const history: ChatMessage[] = [
      ...answered,
      { id: nextId('u'), role: 'user', kind: 'answer', answer }
    ];
    setMessages(history);
    await runControl(history);
  };

  const handleIntentConfirm = async (msgId: string, confirmed: IntentSummary) => {
    patch(msgId, m => (m.kind === 'intent' ? { ...m, status: 'confirmed' } : m));
    setIntent(confirmed);
    const doc = await generateDoc(confirmed, confirmed.deliverables[0]);
    // 非方案模式：一份材料就是全部产出，这里就结束了
    if (doc && confirmed.mode === 'plan') setPlanMarkdown(doc.markdown);
  };

  const handleIntentRevise = async (feedback: string) => {
    const history: ChatMessage[] = [
      ...messages,
      { id: nextId('u'), role: 'user', kind: 'text', text: feedback }
    ];
    setMessages(history);
    await runControl(history);
  };

  const handlePlanRevise = async (feedback: string) => {
    if (!intent) return;
    push({ id: nextId('u'), role: 'user', kind: 'text', text: feedback });
    const doc = await generateDoc(intent, intent.deliverables[0], { feedback });
    if (doc) setPlanMarkdown(doc.markdown);
  };

  const handlePlanConfirm = async (msgId: string) => {
    if (!intent || !planMarkdown) return;
    patch(msgId, m => (m.kind === 'document' ? { ...m, awaitingConfirm: false } : m));

    setBusy(true);
    let deliverables: Deliverable[] = [];
    try {
      deliverables = await derivePlanDeliverables(intent, planMarkdown, {
        signal: newAbort()
      });
    } catch (err) {
      pushError(err);
      setBusy(false);
      return;
    }
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
      // 串行生成：每份材料都要看到已确认的方案，且避免并发把上下文打乱
      const doc = await generateDoc(intent, d, { planMarkdown });
      if (!doc) break; // 出错或被中止就停下，错误消息已经推进对话
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setBusy(false);
  };

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setIntent(undefined);
    setPlanMarkdown(undefined);
    setInput('');
    setBusy(false);
  };

  // ===== 渲染 ===== //

  const renderMessage = (m: ChatMessage) => {
    switch (m.kind) {
      case 'text':
        return (
          <Bubble key={m.id} from={m.role === 'user' ? 'user' : 'ai'}>
            <div className="whitespace-pre-wrap">{m.text}</div>
          </Bubble>
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
                note={m.note}
                answer={m.answer}
                pending={busy}
                onSubmit={answer => handleClarifyAnswer(m.id, answer)}
              />
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
                onRevise={handleIntentRevise}
              />
            </div>
          </div>
        );

      case 'document':
        return (
          <div key={m.id} className="flex justify-start">
            <div className="w-full max-w-[92%]">
              <DocumentCard
                doc={m.doc}
                streaming={m.streaming}
                awaitingConfirm={m.awaitingConfirm}
                pending={busy}
                onConfirm={() => handlePlanConfirm(m.id)}
                onRevise={handlePlanRevise}
              />
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

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col p-4 md:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">AI 研究助手</h1>
            <p className="text-xs text-slate-500">
              由 DeepSeek 驱动 · 调用 ux-kit 技能，一句话产出研究材料
            </p>
          </div>
          <div className="flex gap-2">
            {messages.length > 0 && (
              <button
                onClick={reset}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
              >
                新对话
              </button>
            )}
            <button
              onClick={onBack}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
            >
              返回首页
            </button>
          </div>
        </header>

        {skillError && (
          <div className="mb-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
            {skillError}
          </div>
        )}
        {!configured && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            尚未配置 <code className="font-mono">DEEPSEEK_API_KEY</code>
            。请在项目根目录的 <code className="font-mono">.env.local</code> 里填好后重启开发服务。
          </div>
        )}

        <div className="flex-1 space-y-3 pb-4">
          {messages.length === 0 && !blocked && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  说一句你想做的研究，我来产出材料
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  明确说要问卷、访谈提纲或可用性测试方案，我会先跟你确认需求，然后
                  <span className="font-semibold text-slate-800">直接产出那份材料</span>
                  ；如果诉求还比较模糊、或者要好几种材料，我会先出一份研究方案，等你确认后再按阶段生成。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map(ex => (
                  <button
                    key={ex}
                    onClick={() => setInput(ex)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:border-slate-400"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(renderMessage)}

          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                <span className="inline-block animate-pulse">AI 正在思考中…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-slate-100/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={input}
              disabled={blocked}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="例如：帮我编一个外卖 App 的满意度问卷（Enter 发送，Shift+Enter 换行）"
              className="min-h-[3.25rem] flex-1 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
            />
            {busy ? (
              <button
                onClick={stop}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
              >
                停止
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || blocked}
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                发送
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UxKitChat;
