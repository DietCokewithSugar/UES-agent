export interface ServerSkill {
  id: string;
  name: string;
  description: string;
  assets: string[];
  source: 'uploaded';
}

export interface RuntimeInfo {
  mode: 'container' | 'workspace';
  containerImage?: string;
  isolated: boolean;
  note: string;
}

export interface ConversationInfo {
  id: string;
  skills: string[];
  createdAt: string;
  updatedAt: string;
  runtime: RuntimeInfo['mode'];
  containerId?: string;
}

export interface SkillTraceEntry {
  step: 'discover' | 'select' | 'load' | 'resource' | 'execute';
  detail: string;
}

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `请求失败 (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

export const getRuntime = () => request<RuntimeInfo>('/api/runtime');

export const listServerSkills = async () =>
  (await request<{ skills: ServerSkill[] }>('/api/skills')).skills;

export const uploadServerSkill = async (file: File, adminToken?: string) => {
  const form = new FormData();
  form.append('skill', file);
  return (await request<{ skill: ServerSkill }>('/api/skills', {
    method: 'POST',
    headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : undefined,
    body: form
  })).skill;
};

export const removeServerSkill = (id: string, adminToken?: string) =>
  request<void>(`/api/skills/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : undefined
  });

export const createConversation = async (id?: string) =>
  (await request<{ conversation: ConversationInfo }>('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(id ? { id } : {})
  })).conversation;

export const activateConversationSkill = async (conversationId: string, skillId: string) =>
  (await request<{ conversation: ConversationInfo }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/skills/${encodeURIComponent(skillId)}`,
    { method: 'POST' }
  )).conversation;

export const sendSkillMessage = async (
  conversationId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  skillId?: string
) =>
  request<{
    message: { role: 'assistant'; content: string };
    skill: string;
    trace: SkillTraceEntry[];
    runtime: RuntimeInfo['mode'];
  }>(`/api/conversations/${encodeURIComponent(conversationId)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, skillId })
  });

export const destroyConversation = (id: string) =>
  request<void>(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
