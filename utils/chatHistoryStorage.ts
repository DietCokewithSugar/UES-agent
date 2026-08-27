import type { AgentId } from '../services/agents/types';
import type { ChatMessage } from '../services/uxkit/chatHistory';
import type { IntentSummary } from '../services/uxkit/types';
import { slimAttachmentForStorage } from './attachments';

/**
 * 对话历史的本地存储（localStorage）。
 *
 * 只存在浏览器本地，不上传任何地方。约定与 utils/draftStorage.ts 保持一致：
 * 带 version 做前向兼容、访问 storage 前先探测、读写全程 try/catch。
 *
 * **按技能分命名空间**：每个 agent 有自己的历史列表，两个入口互不可见。
 * 配合"每条会话独立的 messages"，就实现了用户要的窗口级上下文隔离——
 * 开新对话没有记忆，从历史回到旧会话则带着完整上下文继续。
 */

export interface StoredSession {
  id: string;
  /** 归属的技能。历史列表按它过滤，旧数据视为 ux-kit。 */
  agentId: AgentId;
  /** 取第一条用户消息的前若干字，作为列表里的标题 */
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  intent?: IntentSummary;
  planMarkdown?: string;
}

interface HistoryFile {
  version: 1;
  sessions: StoredSession[];
}

const STORAGE_KEY = 'uxkit-chat-history-v1';

/** 最多保留多少条会话。超出后丢弃最旧的——产出的文档正文很占空间。 */
const MAX_SESSIONS = 30;

/** 单条会话的体积上限，超过就不再写入，避免一条会话把整个配额吃光。 */
const MAX_SESSION_CHARS = 400_000;

const hasStorage = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const read = (): HistoryFile => {
  if (!hasStorage()) return { version: 1, sessions: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, sessions: [] };
    const parsed = JSON.parse(raw) as HistoryFile;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.sessions)) {
      return { version: 1, sessions: [] };
    }
    return parsed;
  } catch {
    return { version: 1, sessions: [] };
  }
};

const write = (file: HistoryFile): { ok: true } | { ok: false; error: string } => {
  if (!hasStorage()) return { ok: false, error: '当前环境不支持本地存储。' };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
    return { ok: true };
  } catch (error) {
    // 配额写满时先丢掉最旧的几条再试一次，尽量不让用户丢掉当前这条
    try {
      const trimmed: HistoryFile = {
        version: 1,
        sessions: file.sessions.slice(0, Math.max(1, Math.floor(file.sessions.length / 2)))
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '保存对话历史失败'
      };
    }
  }
};

/** 旧版本没有 agentId，一律归到 ux-kit（当时只有这一个技能）。 */
const agentOf = (s: StoredSession): AgentId => s.agentId ?? 'ux-kit';

/** 按更新时间倒序列出某个技能的会话。 */
export const listSessions = (agentId: AgentId): StoredSession[] =>
  read()
    .sessions.filter(s => agentOf(s) === agentId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export const getSession = (id: string): StoredSession | undefined =>
  read().sessions.find(s => s.id === id);

/** 从消息里取标题：第一条用户文本消息的前 24 字。 */
export const deriveTitle = (messages: ChatMessage[]): string => {
  const first = messages.find(
    m => m.role === 'user' && (m.kind === 'text' || m.kind === 'handoff')
  );
  const text =
    first?.kind === 'text'
      ? first.text.trim()
      : first?.kind === 'handoff'
        ? first.handoff.statement.trim()
        : '';
  if (!text) return '新对话';
  return text.length > 24 ? `${text.slice(0, 24)}…` : text;
};

/** 新建或更新一条会话。messages 为空时不写入（避免留下空壳记录）。 */
/**
 * 存进本地前给消息瘦身：图片 dataURL 动辄几 MB，
 * 一条会话就能把 localStorage 配额吃光，所以只保留元信息。
 */
const slimMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.map(m =>
    m.kind === 'text' && m.role === 'user' && m.attachments?.length
      ? { ...m, attachments: m.attachments.map(slimAttachmentForStorage) }
      : m
  );

export const saveSession = (session: {
  id: string;
  agentId: AgentId;
  messages: ChatMessage[];
  intent?: IntentSummary;
  planMarkdown?: string;
  createdAt?: string;
}): { ok: true } | { ok: false; error: string } => {
  if (session.messages.length === 0) return { ok: true };

  const now = new Date().toISOString();
  const file = read();
  const existing = file.sessions.find(s => s.id === session.id);

  const next: StoredSession = {
    id: session.id,
    agentId: session.agentId,
    title: deriveTitle(session.messages),
    createdAt: existing?.createdAt ?? session.createdAt ?? now,
    updatedAt: now,
    messages: slimMessages(session.messages),
    intent: session.intent,
    planMarkdown: session.planMarkdown
  };

  if (JSON.stringify(next).length > MAX_SESSION_CHARS) {
    return { ok: false, error: '这条对话太大，已停止自动保存到本地历史。' };
  }

  const others = file.sessions.filter(s => s.id !== session.id);
  const sessions = [next, ...others]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_SESSIONS);

  return write({ version: 1, sessions });
};

export const deleteSession = (id: string): void => {
  const file = read();
  write({ version: 1, sessions: file.sessions.filter(s => s.id !== id) });
};

/** 清空某个技能的历史；另一个技能的记录保持不动。 */
export const clearAllSessions = (agentId: AgentId): void => {
  const file = read();
  write({ version: 1, sessions: file.sessions.filter(s => agentOf(s) !== agentId) });
};

export const newSessionId = (): string =>
  `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 相对时间，用于历史列表。 */
export const formatRelative = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
};
