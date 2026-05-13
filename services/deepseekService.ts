/**
 * DeepSeek API 服务层
 * 文档：https://api-docs.deepseek.com/zh-cn/
 *
 * 该服务专用于 "AI 体验伙伴" 功能，与原有 geminiService 解耦。
 * 接口与 OpenAI 兼容，调用 /v1/chat/completions。
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

// ===== 业务封装：AI 体验伙伴 ===== //

/**
 * 通用的"理解校准"返回：当 AI 觉得用户的需求/选择存在歧义时，
 * 返回 ABC 三个可能方向 + 引导用户自行补充的 D 选项（前端实现）。
 * 当 AI 信心充足时，直接给出 result。
 */
export interface ClarifyOption {
  id: 'A' | 'B' | 'C';
  title: string;
  description: string;
}

export type StageKind =
  | 'researchQuestion'   // 步骤2：业务问题 -> 研究问题
  | 'researchPlan'       // 步骤3：研究方案
  | 'executionGuide';    // 步骤4：执行指南

export interface ResearchQuestionResult {
  researchQuestion: string;
  subQuestions: string[];
  rationale: string;
}

export interface ResearchPlanResult {
  method: string;              // 例如：用户访谈 / 问卷调研 / 可用性测试
  methodCategory:
    | 'interview'
    | 'survey'
    | 'usability_test'
    | 'diary_study'
    | 'focus_group'
    | 'desk_research'
    | 'mixed'
    | 'other';
  sample: string;
  duration: string;
  rationale: string;
  alternatives?: string[];
}

export interface QuotaItem {
  dimension: string;
  buckets: { label: string; count: number; note?: string }[];
}

export interface InterviewQuestion {
  id: string;
  topic: string;
  question: string;
  followUps?: string[];
}

export interface ExecutionGuideResult {
  recruitment: {
    totalSample: number;
    summary: string;
    quotas: QuotaItem[];
    screeningCriteria: string[];
  };
  outline: {
    sections: {
      name: string;
      duration: string;
      questions: InterviewQuestion[];
    }[];
  };
  cautions: string[];
  recordTemplateColumns: string[]; // 用于生成 CSV 模板
}

export type ClarifyResponse<T> =
  | { kind: 'clarify'; clarification: { question: string; options: ClarifyOption[] } }
  | { kind: 'result'; result: T };

const SYSTEM_PROMPT = `你是一名经验丰富的用户体验研究专家（AI 体验伙伴），擅长引导非专业人士完成一次完整的用户研究。
你必须用简体中文回答。
你的输出必须是严格 JSON，不要附加 markdown 围栏，不要附加多余解释。
当用户输入信息不充分、有多种合理解读时，你需要先提供一个"理解校准"问题，给出三个可能的方向（A/B/C）。
当信息足够清晰时，直接返回研究结果。`;

interface StageContext {
  needs: string;        // 步骤1的产品/功能/需求
  phase: string;        // 步骤1的阶段
  problem: string;      // 步骤1要搞清楚的问题
  clarifications: {     // 用户在之前阶段做的补充确认
    stage: StageKind;
    summary: string;
  }[];
  confirmedResearchQuestion?: string;
  confirmedResearchPlan?: ResearchPlanResult;
  feedback?: string;    // 用户上一轮"不太对"时的补充
}

const buildContextDescription = (ctx: StageContext): string => {
  const parts: string[] = [];
  parts.push(`产品/功能/需求：${ctx.needs || '（未填写）'}`);
  parts.push(`所处阶段：${ctx.phase || '（未填写）'}`);
  parts.push(`想搞清楚的问题：${ctx.problem || '（未填写）'}`);
  if (ctx.confirmedResearchQuestion) {
    parts.push(`已确认的研究问题：${ctx.confirmedResearchQuestion}`);
  }
  if (ctx.confirmedResearchPlan) {
    parts.push(
      `已确认的研究方案：方法=${ctx.confirmedResearchPlan.method}；样本=${ctx.confirmedResearchPlan.sample}；周期=${ctx.confirmedResearchPlan.duration}`
    );
  }
  if (ctx.clarifications.length > 0) {
    parts.push(
      `之前阶段的补充说明：\n${ctx.clarifications.map(c => `- [${c.stage}] ${c.summary}`).join('\n')}`
    );
  }
  if (ctx.feedback) {
    parts.push(`用户对上一轮结果的反馈/补充：${ctx.feedback}`);
  }
  return parts.join('\n');
};

const CLARIFY_INSTRUCTION = `判断是否需要先做"理解校准"：
- 如果用户描述中存在多种合理解读、关键信息缺失，请输出 clarify 类型。
- 否则直接输出 result。
clarify 输出格式：
{
  "kind": "clarify",
  "clarification": {
    "question": "...（一个针对性的澄清问题）",
    "options": [
      { "id": "A", "title": "...", "description": "..." },
      { "id": "B", "title": "...", "description": "..." },
      { "id": "C", "title": "...", "description": "..." }
    ]
  }
}
result 输出请按各阶段的指定结构返回。`;

export const generateResearchQuestion = async (
  ctx: StageContext
): Promise<ClarifyResponse<ResearchQuestionResult>> => {
  const userPrompt = `当前任务：将用户的业务问题转化为研究问题。
${buildContextDescription(ctx)}

${CLARIFY_INSTRUCTION}

result 输出格式：
{
  "kind": "result",
  "result": {
    "researchQuestion": "...（一句话凝练的核心研究问题）",
    "subQuestions": ["...", "...", "..."],
    "rationale": "...（解释为什么这么转化）"
  }
}`;
  return deepseekJson<ClarifyResponse<ResearchQuestionResult>>(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.4 }
  );
};

export const generateResearchPlan = async (
  ctx: StageContext
): Promise<ClarifyResponse<ResearchPlanResult>> => {
  const userPrompt = `当前任务：根据已确认的研究问题，推荐一个具体可执行的研究方案。
${buildContextDescription(ctx)}

可选研究方法（从这些里挑最适合的，必要时可组合）：用户访谈 / 问卷调研 / 可用性测试 / 日记研究 / 焦点小组 / 桌面研究 等。

${CLARIFY_INSTRUCTION}

result 输出格式：
{
  "kind": "result",
  "result": {
    "method": "...（如：1v1 用户访谈 / 在线问卷 / 可用性测试 等）",
    "methodCategory": "interview|survey|usability_test|diary_study|focus_group|desk_research|mixed|other",
    "sample": "...（样本规模与画像描述）",
    "duration": "...（建议周期，如 2 周）",
    "rationale": "...（为什么推荐这个方案）",
    "alternatives": ["...", "..."]
  }
}`;
  return deepseekJson<ClarifyResponse<ResearchPlanResult>>(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.5 }
  );
};

export const generateExecutionGuide = async (
  ctx: StageContext
): Promise<ClarifyResponse<ExecutionGuideResult>> => {
  const userPrompt = `当前任务：根据已确认的研究方案，输出可直接执行的完整指南。
${buildContextDescription(ctx)}

要求：
- 用户招募部分必须给出可量化的配额（例如年龄分布、行业分布等），并给出筛选标准。
- 提纲部分要按阶段划分（如开场、背景了解、深入挖掘、收尾），每个问题包含可选追问。
- 执行注意事项要落地（例如录音征得同意、避免诱导性提问、记录关键证据等）。
- recordTemplateColumns 用于生成访谈/调研记录的 CSV 表头，需贴合该研究方法。
- 如果信息明显不足，请仍然使用 clarify 形式。
- 如果研究方法是问卷类，"outline.sections" 可表示问卷的板块，questions 表示具体问题。

${CLARIFY_INSTRUCTION}

result 输出格式：
{
  "kind": "result",
  "result": {
    "recruitment": {
      "totalSample": 12,
      "summary": "...",
      "quotas": [
        { "dimension": "年龄", "buckets": [ { "label": "25-35岁", "count": 6, "note": "..." } ] }
      ],
      "screeningCriteria": ["...", "..."]
    },
    "outline": {
      "sections": [
        {
          "name": "开场（5min）",
          "duration": "5 分钟",
          "questions": [
            { "id": "q1", "topic": "破冰", "question": "...", "followUps": ["..."] }
          ]
        }
      ]
    },
    "cautions": ["...", "..."],
    "recordTemplateColumns": ["受访者编号", "年龄", "...", "Q1 回答", "Q2 回答", "关键洞察", "情绪标签"]
  }
}`;
  return deepseekJson<ClarifyResponse<ExecutionGuideResult>>(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.55, maxTokens: 4000 }
  );
};

export interface ResultAnalysisReport {
  executiveSummary: string;
  keyFindings: { title: string; description: string; evidence?: string[] }[];
  userSegments?: { name: string; description: string }[];
  painPoints: { issue: string; severity: '高' | '中' | '低'; evidence?: string }[];
  opportunities: { idea: string; rationale: string }[];
  nextSteps: string[];
  unansweredQuestions: string[];
}

/**
 * 分析用户上传的访谈/调研结果文本。
 */
export const analyzeResearchResults = async (params: {
  ctx: StageContext;
  rawContent: string;
  fileNames: string[];
}): Promise<ResultAnalysisReport> => {
  const { ctx, rawContent, fileNames } = params;
  const userPrompt = `当前任务：对用户上传的研究结果（如访谈记录、问卷数据）进行结构化分析，并输出体验研究报告。
研究背景：
${buildContextDescription(ctx)}

上传文件：${fileNames.join('、') || '（未命名）'}

研究原始数据如下（已做截断，节选）：
"""
${rawContent.slice(0, 18000)}
"""

请基于内容进行客观分析，避免编造没有依据的洞察。
请用 JSON 返回，结构：
{
  "executiveSummary": "...",
  "keyFindings": [{ "title": "...", "description": "...", "evidence": ["..."] }],
  "userSegments": [{ "name": "...", "description": "..." }],
  "painPoints": [{ "issue": "...", "severity": "高|中|低", "evidence": "..." }],
  "opportunities": [{ "idea": "...", "rationale": "..." }],
  "nextSteps": ["...", "..."],
  "unansweredQuestions": ["...", "..."]
}`;
  return deepseekJson<ResultAnalysisReport>(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.4, maxTokens: 4000 }
  );
};

export type { StageContext };
