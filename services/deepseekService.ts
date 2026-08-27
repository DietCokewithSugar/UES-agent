/**
 * DeepSeek API 服务层
 * 文档：https://api-docs.deepseek.com/zh-cn/
 *
 * 该服务专用于对话式的 ux-kit 体验，与原有 geminiService 解耦。
 * 接口与 OpenAI 兼容，调用 /v1/chat/completions。
 *
 * 两种调用方式：
 *   - deepseekJson       控制轮：短、非流式、json_object 模式（模式识别 / 追问 / 意图确认）
 *   - deepseekChatStream 产出轮：长、流式、纯 markdown（研究方案 / 问卷 / 提纲 / 测试方案）
 */

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekChatOptions {
  model?: string;
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
}

const DEFAULT_MODEL = 'deepseek-chat';

const getApiKey = (): string => {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error(
      'DeepSeek API Key 未配置。请在项目根目录的 .env.local 中添加 DEEPSEEK_API_KEY。'
    );
  }
  return key;
};

const getBaseUrl = (): string => {
  const base = process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com';
  return base.replace(/\/$/, '');
};

/**
 * 调用 DeepSeek Chat Completions 接口，返回 assistant 的文本内容。
 */
export const deepseekChat = async (
  messages: DeepSeekMessage[],
  options: DeepSeekChatOptions = {}
): Promise<string> => {
  const apiKey = getApiKey();
  const url = `${getBaseUrl()}/v1/chat/completions`;

  const body: Record<string, unknown> = {
    model: options.model || DEFAULT_MODEL,
    messages,
    temperature: options.temperature ?? 0.5,
    stream: false
  };
  if (options.maxTokens) body.max_tokens = options.maxTokens;
  if (options.jsonMode) body.response_format = { type: 'json_object' };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal: options.signal
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`DeepSeek API 调用失败 (${response.status}): ${errText.slice(0, 500)}`);
  }

  const data: any = await response.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('DeepSeek 返回内容为空或格式异常。');
  }
  return content;
};

/**
 * 调用 DeepSeek 并强制解析 JSON 响应。
 * 自带兜底：剥离 ```json ... ``` 围栏并截取最外层大括号。
 */
export const deepseekJson = async <T = unknown>(
  messages: DeepSeekMessage[],
  options: Omit<DeepSeekChatOptions, 'jsonMode'> = {}
): Promise<T> => {
  const raw = await deepseekChat(messages, { ...options, jsonMode: true });
  return safeParseJson<T>(raw);
};

export const safeParseJson = <T = unknown>(raw: string): T => {
  if (!raw) throw new Error('AI 返回为空，无法解析 JSON。');
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(`无法解析 AI 返回的 JSON：${(err as Error).message}\n原文：${raw.slice(0, 400)}`);
  }
};

export const isDeepSeekConfigured = (): boolean => {
  return Boolean(process.env.DEEPSEEK_API_KEY);
};


/**
 * 流式调用 DeepSeek，边收边把增量文本交给 onDelta，返回完整文本。
 *
 * 产出轮用它：一份研究方案或问卷动辄几千字，非流式要干等几十秒。
 *
 * SSE 解析上的三个坑：
 *   1. 一个 network chunk 不一定落在行边界上，也不一定落在 UTF-8 字符边界上，
 *      所以要用 TextDecoder({stream:true}) 并跨 chunk 缓冲未收完的那一行；
 *   2. 服务端可能发注释行（以 ':' 开头的 keep-alive），要跳过；
 *   3. 结束标记是 `data: [DONE]`，它不是合法 JSON，必须先判后解析。
 */
export const deepseekChatStream = async (
  messages: DeepSeekMessage[],
  options: DeepSeekChatOptions & { onDelta?: (chunk: string) => void } = {}
): Promise<{ text: string; truncated: boolean }> => {
  const apiKey = getApiKey();
  const url = `${getBaseUrl()}/v1/chat/completions`;

  const body: Record<string, unknown> = {
    model: options.model || DEFAULT_MODEL,
    messages,
    temperature: options.temperature ?? 0.5,
    stream: true
  };
  if (options.maxTokens) body.max_tokens = options.maxTokens;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal: options.signal
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`DeepSeek API 调用失败 (${response.status}): ${errText.slice(0, 500)}`);
  }
  if (!response.body) {
    throw new Error('DeepSeek 未返回流式响应体。');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let text = '';
  let finishReason: string | null = null;

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) return; // 空行 / keep-alive 注释
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice('data:'.length).trim();
    if (payload === '[DONE]') return;
    let parsed: any;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return; // 单个畸形分片不该中断整条流
    }
    if (parsed?.error) {
      throw new Error(`DeepSeek 流式返回错误：${parsed.error.message || payload.slice(0, 200)}`);
    }
    const choice = parsed?.choices?.[0];
    const delta: string | undefined = choice?.delta?.content;
    if (typeof delta === 'string' && delta) {
      text += delta;
      options.onDelta?.(delta);
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // \r\n 与 \n 两种分帧都要吃掉
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? ''; // 最后一段可能是半行，留到下个 chunk
      for (const line of lines) consumeLine(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeLine(buffer);
  } finally {
    reader.releaseLock();
  }

  if (!text) {
    throw new Error('DeepSeek 流式返回内容为空。');
  }
  return { text, truncated: finishReason === 'length' };
};
