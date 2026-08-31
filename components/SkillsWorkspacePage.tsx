import React, { useEffect, useRef, useState } from 'react';
import {
  activateConversationSkill,
  createConversation,
  destroyConversation,
  getRuntime,
  listServerSkills,
  removeServerSkill,
  sendSkillMessage,
  uploadServerSkill,
  type ConversationInfo,
  type RuntimeInfo,
  type ServerSkill,
  type SkillTraceEntry
} from '../services/skills/skillServerApi';

interface Props {
  onBack: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  trace?: SkillTraceEntry[];
  skill?: string;
  artifacts?: string[];
}

export const SkillsWorkspacePage: React.FC<Props> = ({ onBack }) => {
  const [skills, setSkills] = useState<ServerSkill[]>([]);
  const [runtime, setRuntime] = useState<RuntimeInfo>();
  const [conversation, setConversation] = useState<ConversationInfo>();
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialConversationId = useRef(`chat-${crypto.randomUUID()}`);

  const refreshSkills = async () => {
    const next = await listServerSkills();
    setSkills(next);
    setSelectedSkillId(current => current || next[0]?.id || '');
  };

  const startConversation = async () => {
    setError(undefined);
    setMessages([]);
    const next = await createConversation();
    setConversation(next);
    return next;
  };

  useEffect(() => {
    Promise.all([refreshSkills(), getRuntime(), createConversation(initialConversationId.current)])
      .then(([, runtimeInfo, conversationInfo]) => {
        setRuntime(runtimeInfo);
        setConversation(conversationInfo);
      })
      .catch(err => setError(err instanceof Error ? err.message : '初始化失败'));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(undefined);
    try {
      const skill = await uploadServerSkill(file, adminToken);
      await refreshSkills();
      setSelectedSkillId(skill.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(`确定删除技能「${id}」吗？`)) return;
    try {
      await removeServerSkill(id, adminToken);
      setSelectedSkillId('');
      await refreshSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleNewConversation = async () => {
    try {
      await startConversation();
    } catch (err) {
      setError(err instanceof Error ? err.message : '新建对话失败');
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !conversation || !selectedSkillId || sending) return;
    const userMessage: Message = { role: 'user', content: text };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput('');
    setSending(true);
    setError(undefined);
    try {
      let activeConversation = conversation;
      if (!activeConversation.skills.includes(selectedSkillId)) {
        activeConversation = await activateConversationSkill(activeConversation.id, selectedSkillId);
        setConversation(activeConversation);
      }
      const result = await sendSkillMessage(
        activeConversation.id,
        history.map(({ role, content }) => ({ role, content })),
        selectedSkillId
      );
      setMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: result.message.content,
          trace: result.trace,
          skill: result.skill,
          artifacts: result.artifacts
        }
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '调用技能失败');
    } finally {
      setSending(false);
    }
  };

  const closeCurrent = async () => {
    if (!conversation) return;
    try {
      await destroyConversation(conversation.id);
      await startConversation();
    } catch (err) {
      setError(err instanceof Error ? err.message : '释放运行环境失败');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div>
            <h1 className="text-lg font-semibold">Skills 工作台</h1>
            <p className="text-xs text-slate-500">上传、启用并在独立对话运行环境中调用 Agent Skill</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleNewConversation} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
              新对话
            </button>
            <button onClick={onBack} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
              返回首页
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-5 md:px-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">运行环境</h2>
                <p className="mt-1 font-mono text-[11px] text-slate-400">
                  {conversation?.id || '正在创建…'}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                runtime?.isolated ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {runtime?.mode === 'e2b' ? 'E2B · OpenCode' : '等待 E2B 配置'}
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">{runtime?.note || '正在检测运行时…'}</p>
            {runtime?.model && (
              <p className="mt-2 font-mono text-[11px] text-slate-400">模型：{runtime.model}</p>
            )}
            {conversation && (
              <button onClick={closeCurrent} className="mt-3 text-xs text-rose-600 underline">
                释放当前环境
              </button>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">已安装 Skills</h2>
                <p className="mt-1 text-[11px] text-slate-500">兼容含 SKILL.md 的 ZIP 包</p>
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {uploading ? '上传中…' : '上传'}
              </button>
              <input ref={fileRef} type="file" accept=".zip,application/zip" onChange={handleUpload} className="hidden" />
            </div>
            <input
              type="password"
              value={adminToken}
              onChange={event => setAdminToken(event.target.value)}
              placeholder="管理员令牌（服务端启用时必填）"
              autoComplete="off"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-violet-400"
            />

            <div className="mt-3 space-y-2">
              {skills.map(skill => (
                <div
                  key={skill.id}
                  className={`rounded-lg border p-3 ${
                    selectedSkillId === skill.id ? 'border-violet-300 bg-violet-50' : 'border-slate-200'
                  }`}
                >
                  <button type="button" onClick={() => setSelectedSkillId(skill.id)} className="w-full text-left">
                    <span className="block text-sm font-medium">{skill.name}</span>
                    <span className="mt-1 block line-clamp-3 text-xs leading-5 text-slate-500">
                      {skill.description || '未提供 description'}
                    </span>
                    <span className="mt-2 block text-[11px] text-slate-400">
                      {skill.id} · {skill.assets.length} 个资源
                    </span>
                  </button>
                  <button onClick={() => handleDelete(skill.id)} className="mt-2 text-[11px] text-rose-500 underline">
                    删除
                  </button>
                </div>
              ))}
              {!skills.length && (
                <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">
                  还没有技能，请上传 ZIP 包。
                </div>
              )}
            </div>
          </section>
        </aside>

        <section className="flex min-h-[75vh] flex-col rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-semibold">
              {skills.find(skill => skill.id === selectedSkillId)?.name || '请选择一个技能'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Skill 会同步到云端沙箱，由 OpenCode 的原生 skill 工具按需加载并执行。
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!messages.length && (
              <div className="flex h-full min-h-72 items-center justify-center text-center">
                <div>
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-xl">S</div>
                  <h2 className="mt-3 text-base font-semibold">用这个 Skill 完成任务</h2>
                  <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
                    左侧选择技能，然后描述任务。每条新对话都会获得独立 E2B OpenCode 沙箱。
                  </p>
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                  message.role === 'user' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50'
                }`}>
                  {message.trace && (
                    <details className="mb-3 rounded-lg border border-violet-200 bg-white p-2 text-xs text-slate-600">
                      <summary className="cursor-pointer font-medium text-violet-700">
                        Skill 调用轨迹 · {message.skill}
                      </summary>
                      <ol className="mt-2 space-y-1">
                        {message.trace.map((entry, traceIndex) => (
                          <li key={`${entry.step}-${traceIndex}`}>{traceIndex + 1}. {entry.detail}</li>
                        ))}
                      </ol>
                    </details>
                  )}
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  {message.artifacts && message.artifacts.length > 0 && conversation && (
                    <div className="mt-3 border-t border-slate-200 pt-2">
                      <p className="mb-1 text-[11px] font-medium text-slate-500">
                        OpenCode 产出文件（请在沙箱到期前下载）
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {message.artifacts.map(artifact => (
                          <a
                            key={artifact}
                            href={`/api/conversations/${encodeURIComponent(conversation.id)}/files?path=${encodeURIComponent(artifact)}`}
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-violet-700 hover:border-violet-300"
                          >
                            下载 {artifact}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && <p className="text-sm text-slate-400 animate-pulse">正在调用 Skill…</p>}
            <div ref={bottomRef} />
          </div>

          {error && <div className="mx-4 mb-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          <div className="border-t border-slate-200 p-4">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                rows={2}
                placeholder="描述你的任务，Enter 发送，Shift+Enter 换行"
                className="min-h-12 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || !conversation || !selectedSkillId || sending}
                className="rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-40"
              >
                发送
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
