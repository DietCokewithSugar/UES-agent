/**
 * DeepSeek API 服务层
 * 文档：https://api-docs.deepseek.com/zh-cn/
 *
 * 该服务专用于 "AI 体验伙伴" 功能，与原有 geminiService 解耦。
 * 接口与 OpenAI 兼容，调用 /v1/chat/completions。
 */

import {
  buildSkillCatalog,
  buildSkillKnowledge,
  findSkillForMethod,
  getSkill
} from './skills/skillRegistry';

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
 * 返回 2-6 个可多选的方向选项（跳过与自定义补充由前端内置）。
 * 当 AI 信心充足时，直接给出 result。
 */
export interface ClarifyOption {
  /** 单个大写字母 id（A-F），由 normalizeClarify 兜底重派；前端只用作 key 与展示 */
  id: string;
  title: string;
  description: string;
}

export type StageKind =
  | 'researchQuestion'   // 步骤2：业务问题 -> 研究问题
  | 'researchPlan'       // 步骤3：研究方案
  | 'executionGuide';    // 步骤4：执行指南

export interface ResearchQuestionResult {
  /** 研究问题陈述：一句话包含 研究对象 + 目标人群 + 研究意图（可括注类型/范围） */
  researchQuestion: string;
  subQuestions: string[];
  rationale: string;
  /** problem-clarifier 五维度的澄清结论（已明确的维度） */
  clarifiedDimensions?: { dimension: string; conclusion: string }[];
}

export type ResearchMethodCategory =
  | 'interview'
  | 'survey'
  | 'usability_test'
  | 'diary_study'
  | 'focus_group'
  | 'desk_research'
  | 'mixed'
  | 'other';

/** 研究内容概览中的一个话题模块 / 问卷板块 / 测试任务 */
export interface ContentOutlineSection {
  title: string;
  duration?: string;
  /** 核心探针（访谈类）/ 关键观察点（可用性类） */
  probes?: string[];
  description?: string;
}

/** 研究内容概览（research-plan-generator 方法论的核心模块） */
export interface ContentOutline {
  sections: ContentOutlineSection[];
  /** 嵌入任务（如访谈后半段的卡片分类） */
  embedTask?: { technique: string; description: string };
}

export interface ResearchSubPlan {
  /** 子方案在 UI 中的稳定 id，AI 不强制返回，前端兜底生成 */
  id?: string;
  /** 该子方法的简短名称，例如 "用户访谈" / "在线问卷" */
  method: string;
  methodCategory: Exclude<ResearchMethodCategory, 'mixed'>;
  /** 该子方法独立的样本规模与画像描述 */
  sample: string;
  /** 该子方法独立的周期，如 "1 周" */
  duration: string;
  /** 该子方法在整体研究中的角色 / 目的 */
  purpose: string;
  /** 该阶段承载的嵌入技术（卡诺模型 / ETS体验评估 / JTBD / 卡片分类 / 眼动测试 / 灵犀旅程 等） */
  embeddedTechniques?: string[];
  /** 该阶段的研究内容概览，将作为执行指南的提纲骨架 */
  contentOutline?: ContentOutline;
}

export interface ResearchPlanResult {
  method: string;              // 例如：用户访谈 / 问卷调研 / 可用性测试
  methodCategory: ResearchMethodCategory;
  sample: string;
  duration: string;
  rationale: string;
  alternatives?: string[];
  /**
   * 当 methodCategory === 'mixed' 时必须给出子方案列表；
   * 单方法可省略或返回长度为 1 的数组。
   */
  subPlans?: ResearchSubPlan[];
  /** 研究类型：探索型 / 测量型 / 评估型 / 描述型 / 混合型 */
  researchType?: string;
  /** 方案局限性说明 */
  limitations?: string[];
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
  /** 铺垫问题（CBA 编题：先从简单具体处切入） */
  leadIn?: string;
  /** 设置目的：该题映射到哪个研究目标 */
  purpose?: string;
  /** CBA 类型：C=情景 / B=行为+原因 / A=态度+建议 */
  cbaType?: string;
}

export interface GuideSection {
  name: string;
  duration: string;
  /** 模块组织方法：标准CBA / JTBD / 旅程回溯 / 卡片分类任务 / 问卷板块 等 */
  organizingMethod?: string;
  questions: InterviewQuestion[];
}

/** 探询指南（interview-guide-generator：访谈员的"导航仪"，访谈类必出） */
export interface ProbingGuide {
  /** 追问三向仪（360度提问法）：上推 / 平移 / 下切 */
  threeSixty?: { direction: string; usage: string; example?: string }[];
  /** ORID 追问链：O 事实 / R 感受 / I 思考 / D 行动 */
  orid?: { level: string; questions: string[] }[];
  /** 投射技术：拟人法 / 联想法 / 第三人称法 / 完成法 */
  projective?: { technique: string; example: string }[];
  /** 特殊用户应对：好奇用户 / 专家用户 / 佛系用户 */
  specialUsers?: { userType: string; strategy: string }[];
}

export interface ExecutionGuideResult {
  recruitment: {
    totalSample: number;
    summary: string;
    quotas: QuotaItem[];
    screeningCriteria: string[];
  };
  outline: {
    sections: GuideSection[];
  };
  cautions: string[];
  recordTemplateColumns: string[]; // 用于生成 CSV 模板
  probingGuide?: ProbingGuide;
}

export type ClarifyResponse<T> =
  | { kind: 'clarify'; clarification: { question: string; options: ClarifyOption[] } }
  | { kind: 'result'; result: T };

const SYSTEM_PROMPT = `你是一名经验丰富的用户体验研究专家（AI 体验伙伴），擅长引导非专业人士完成一次完整的用户研究。
你必须用简体中文回答。
你的输出必须是严格 JSON，不要附加 markdown 围栏，不要附加多余解释。
当用户输入信息不充分、有多种合理解读时，你需要先提供一个"理解校准"问题，给出 2-6 个可多选的方向选项。
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

/** 把研究内容概览序列化成上下文行（缩进 indent），供后续阶段作为提纲骨架。 */
const describeContentOutline = (
  outline: ContentOutline | undefined,
  indent: string
): string[] => {
  if (!outline?.sections?.length) return [];
  const lines: string[] = [`${indent}该子方法的研究内容概览：`];
  outline.sections.forEach(sec => {
    lines.push(
      `${indent}- ${sec.title}${sec.duration ? `（${sec.duration}）` : ''}` +
        (sec.description ? `：${sec.description}` : '') +
        (sec.probes?.length ? `｜核心探针：${sec.probes.join('；')}` : '')
    );
  });
  if (outline.embedTask) {
    lines.push(
      `${indent}- 嵌入任务：${outline.embedTask.technique} — ${outline.embedTask.description}`
    );
  }
  return lines;
};

const buildContextDescription = (ctx: StageContext): string => {
  const parts: string[] = [];
  parts.push(`产品/功能/需求：${ctx.needs || '（未填写）'}`);
  parts.push(`所处阶段：${ctx.phase || '（未填写）'}`);
  parts.push(`想搞清楚的问题：${ctx.problem || '（未填写）'}`);
  if (ctx.confirmedResearchQuestion) {
    parts.push(`已确认的研究问题：${ctx.confirmedResearchQuestion}`);
  }
  if (ctx.confirmedResearchPlan) {
    const plan = ctx.confirmedResearchPlan;
    parts.push(
      `已确认的研究方案：方法=${plan.method}；样本=${plan.sample}；周期=${plan.duration}` +
        (plan.researchType ? `；研究类型=${plan.researchType}` : '')
    );
    if (plan.subPlans && plan.subPlans.length > 0) {
      const subs = plan.subPlans
        .map((sp, i) => {
          const lines: string[] = [
            `  ${i + 1}. ${sp.method}（${sp.methodCategory}）样本=${sp.sample}；周期=${sp.duration}；目的=${sp.purpose}` +
              (sp.embeddedTechniques?.length
                ? `；嵌入技术=${sp.embeddedTechniques.join('、')}`
                : '')
          ];
          lines.push(...describeContentOutline(sp.contentOutline, '    '));
          return lines.join('\n');
        })
        .join('\n');
      parts.push(`方案中的子方法明细：\n${subs}`);
    }
    if (plan.limitations?.length) {
      parts.push(`方案局限性：${plan.limitations.join('；')}`);
    }
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
clarify 规则：
- options 提供 2-6 个选项，id 依次使用 "A"、"B"、"C"、"D"、"E"、"F"（大写单字母，不重复）。
- 选项之间可以同时成立（界面支持多选），描述要具体、互相区分。
- 不要包含"跳过此问题""其他（请描述）""以上都不是"之类的选项——界面已内置"跳过校准"按钮和自定义补充输入框。
clarify 输出格式：
{
  "kind": "clarify",
  "clarification": {
    "question": "...（一个针对性的澄清问题，只围绕一个主题）",
    "options": [
      { "id": "A", "title": "...", "description": "..." },
      { "id": "B", "title": "...", "description": "..." }
    ]
  }
}
result 输出请按各阶段的指定结构返回。`;

/**
 * 兜底规整 clarify 选项：截断到 6 个，并按 A-F 顺序重派 id，
 * 防止模型返回重复 / 异常 id 破坏前端多选状态与 React key。
 */
const CLARIFY_ID_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const normalizeClarify = <T,>(resp: ClarifyResponse<T>): ClarifyResponse<T> => {
  if (!resp || resp.kind !== 'clarify' || !resp.clarification) return resp;
  const options = (resp.clarification.options || [])
    .slice(0, CLARIFY_ID_LETTERS.length)
    .map((o, i) => ({ ...o, id: CLARIFY_ID_LETTERS[i] }));
  return { ...resp, clarification: { ...resp.clarification, options } };
};

export const generateResearchQuestion = async (
  ctx: StageContext
): Promise<ClarifyResponse<ResearchQuestionResult>> => {
  // 注入 problem-clarifier 流程技能：五维度缺口驱动的多轮澄清方法论
  const clarifierSkill = getSkill('problem-clarifier');
  const clarifierKnowledge = clarifierSkill
    ? `\n=== 问题澄清方法论（problem-clarifier 技能，请严格遵循）===\n${buildSkillKnowledge(
        clarifierSkill
      )}\n=== 技能说明结束 ===\n`
    : '';
  // 已进行的澄清轮数：用于强制收敛，避免无限追问
  const rounds = ctx.clarifications.filter(
    c => c.stage === 'researchQuestion'
  ).length;
  const userPrompt = `当前任务：将用户的业务问题澄清并转化为清晰的研究问题陈述。
${buildContextDescription(ctx)}
${clarifierKnowledge}
执行要求（把技能中的 question 工具交互映射到本系统的 clarify 输出）：
- 按技能的五个维度（研究方向 / 研究动机 / 目标人群 / 聚焦范围 / 约束条件）盘点"之前阶段的补充说明"中已明确的信息，找出剩余缺口。
- 若仍有影响研究方案设计的关键缺口：输出 clarify，一轮只问一个维度（可附带最多一个简单补问），选项要贴合用户的原话场景，不要照抄模板。
- 若缺口已填够（技能判定"可以停止"的条件成立），或用户已选择跳过校准：直接输出 result，不要重复追问已明确的维度。
- 当前已进行 ${rounds} 轮校准${
    rounds >= 4
      ? '，本轮必须直接输出 result，不允许再提问'
      : '（大多数情况 3-5 轮内收敛）'
  }。
- researchQuestion 必须是"研究问题陈述"：一句自然语言，包含 研究对象 + 目标人群 + 研究意图，可在括号内补充研究类型与范围。
  示例：活跃用户（近30天有使用行为）对当前产品还有哪些未被满足的功能需求？（探索性研究，全产品范围）

${CLARIFY_INSTRUCTION}

result 输出格式：
{
  "kind": "result",
  "result": {
    "researchQuestion": "...（研究问题陈述：研究对象 + 目标人群 + 研究意图）",
    "subQuestions": ["...", "...", "..."],
    "rationale": "...（解释为什么这样澄清与转化）",
    "clarifiedDimensions": [
      { "dimension": "研究方向", "conclusion": "..." },
      { "dimension": "目标人群", "conclusion": "..." }
    ]
  }
}`;
  const resp = await deepseekJson<ClarifyResponse<ResearchQuestionResult>>(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.4 }
  );
  return normalizeClarify(resp);
};

/** 研究方案 result JSON 模板（第一段与第二段共用，保证两段输出结构一致） */
const PLAN_RESULT_FORMAT = `result 输出格式：
{
  "kind": "result",
  "result": {
    "method": "...（如：1v1 用户访谈 / 在线问卷 / 可用性测试 / 访谈+问卷 等）",
    "methodCategory": "interview|survey|usability_test|diary_study|focus_group|desk_research|mixed|other",
    "sample": "...（样本规模与画像描述；混合方案时为整体总览）",
    "duration": "...（建议周期，如 2 周）",
    "rationale": "...（为什么推荐这个方案）",
    "researchType": "探索型|测量型|评估型|描述型|混合型",
    "alternatives": ["...", "..."],
    "limitations": ["...（方案局限性与注意事项）"],
    "subPlans": [
      {
        "method": "...",
        "methodCategory": "interview|survey|usability_test|diary_study|focus_group|desk_research|other",
        "sample": "...（该子方法独立样本量，如 '8 人 1v1 深访'）",
        "duration": "...（该子方法独立周期）",
        "purpose": "...（该子方法的目的）",
        "embeddedTechniques": ["卡诺模型", "ETS体验评估"],
        "contentOutline": {
          "sections": [
            {
              "title": "模块一：认知画像",
              "duration": "约15分钟",
              "probes": ["...（核心探针 / 问卷板块内容 / 测试任务观察点）"],
              "description": "...（该模块的研究内容描述）"
            }
          ],
          "embedTask": { "technique": "卡片分类", "description": "..." }
        }
      }
    ]
  }
}`;

/** 覆盖声明：技能文档内嵌的 snake_case JSON 结构不得进入最终输出（最高概率失败点） */
const PLAN_SCHEMA_OVERRIDE = `特别注意：技能文档内部展示的 JSON 结构（plan_title / stages / collection_method 等 snake_case 字段）只是方法论说明，你的最终输出必须且只能使用下方 result 输出格式中的字段名（camelCase），不得混用。`;

/** research-plan-generator 方法论的落地要求（两段共用） */
const PLAN_METHODOLOGY_RULES = `方法论落地要求：
- 先确定各阶段的"数据采集方式"（用户访谈 / 问卷调查 / 可用性评估 / 用户声音分析），再选择需要嵌入的技术（卡诺模型 / ETS体验评估 / JTBD / 卡片分类 / 眼动测试 / 灵犀旅程 / 用户画像）；同一采集方式承载的嵌入技术必须合并为同一阶段；阶段数（按数据采集方式计）不超过 4 个。
- 每个阶段对应输出中 subPlans 的一项：embeddedTechniques 列出该阶段的嵌入技术；contentOutline 给出研究内容概览——访谈类列话题模块（title/duration/probes 核心探针/description），问卷类列问卷板块与大致题量，可用性类列测试任务与观察要点；嵌入任务（如访谈后半段的卡片分类）放在 embedTask。
- 单一阶段时：顶层 methodCategory 为该方法本身（不能是 "mixed"），subPlans 必须返回长度为 1 的数组并带上 contentOutline，不要省略 subPlans。多阶段时顶层 methodCategory = "mixed"。
- methodCategory 映射：用户访谈→interview；问卷调查→survey；可用性评估→usability_test；用户声音分析→desk_research；独立执行的卡片分类→other。嵌入技术不改变所在阶段的 methodCategory。
- 样本量、样本特征与配额应遵循技能参考资料中各方法的经验值（如访谈 8-12 人信息饱和、卡片分类独立执行 ≥15 人）。
- ${PLAN_SCHEMA_OVERRIDE}`;

/** 组合方案约束（沿用原有约定） */
const PLAN_MIXED_RULES = `约束（关于组合方案，非常重要，请严格遵守）：
- 当你认为单一方法不够，需要"组合 / 混合方法"时：
  - 顶层字段 method 用一句话概括整体方案（例如：定性访谈 + 定量问卷的混合研究）；
  - methodCategory 必须为 "mixed"；
  - 顶层 sample 用一句话总览（例如："访谈 8 人 + 问卷 200 份"），但不再用于后续执行指南的样本量基准；
  - subPlans 必须给出 2 个或以上子方案，每个子方案要明确：method（必须是单一方法，不允许再是 "mixed"）、methodCategory、sample（该方法独立的样本量与画像）、duration（该方法独立的周期）、purpose（该方法在整体研究中的角色）。
  - 顶层 sample / duration 的数字必须和 subPlans 中各子方法的样本量、周期相加/总览保持一致，不允许互相矛盾。`;

/**
 * 按方案草稿中命中的采集方式与嵌入技术，挑选 research-plan-generator 的参考文件。
 * 用于两段式生成的第二段：只注入相关 references，控制上下文规模。
 */
const pickPlanReferences = (plan: ResearchPlanResult): string[] => {
  const refs = new Set<string>(['sample-size-calculator.md']);
  const categories = new Set<string>();
  if (plan.methodCategory && plan.methodCategory !== 'mixed') {
    categories.add(plan.methodCategory);
  }
  (plan.subPlans || []).forEach(sp => categories.add(sp.methodCategory));
  const categoryRefMap: Record<string, string> = {
    interview: 'interview.md',
    focus_group: 'interview.md',
    survey: 'survey.md',
    usability_test: 'usability-test.md',
    desk_research: 'voc-analysis.md'
  };
  categories.forEach(cat => {
    const ref = categoryRefMap[cat];
    if (ref) refs.add(ref);
  });
  const techniqueText = (plan.subPlans || [])
    .flatMap(sp => sp.embeddedTechniques || [])
    .join(' ')
    .toLowerCase();
  const techniqueRefRules: { pattern: RegExp; ref: string }[] = [
    { pattern: /卡诺|kano/, ref: 'kano-model.md' },
    { pattern: /ets/, ref: 'ets-model.md' },
    { pattern: /卡片分类|card/, ref: 'card-sorting.md' },
    { pattern: /眼动|eye/, ref: 'eye-tracking.md' },
    { pattern: /旅程|灵犀|journey/, ref: 'journey-mapping.md' },
    { pattern: /画像|persona/, ref: 'persona.md' },
    { pattern: /jtbd/, ref: 'interview.md' }
  ];
  techniqueRefRules.forEach(rule => {
    if (rule.pattern.test(techniqueText)) refs.add(rule.ref);
  });
  return Array.from(refs);
};

/**
 * 两段式研究方案生成（research-plan-generator 技能规定的流程：先匹配方法，再读取
 * 命中方法的参考文件细化）：
 *   第一段：注入 SKILL.md 正文做层级式方法匹配，产出方案草稿（clarify 也发生在这一段）；
 *   第二段：按草稿命中的方法/嵌入技术注入对应 references，细化样本量、配额与内容概览。
 * 第二段失败时降级返回第一段草稿。如需单次全量注入（正文 + 全部 references），
 * 可改为一次 buildSkillKnowledge(planSkill) 调用（约 23-29K tokens，仍在 64K 上下文内）。
 */
export const generateResearchPlan = async (
  ctx: StageContext
): Promise<ClarifyResponse<ResearchPlanResult>> => {
  const skillCatalog = buildSkillCatalog();
  const skillSection = skillCatalog
    ? `\n本系统已安装以下"研究方法技能"（推荐时请优先考虑这些技能覆盖的方法，并参考其适用场景判断何时使用；被技能覆盖的方法在后续设计阶段会得到更专业的支持）：\n${skillCatalog}\n`
    : '';
  const planSkill = getSkill('research-plan-generator');
  const planMethodology = planSkill
    ? `\n=== 研究方案方法论（research-plan-generator 技能，必须严格遵循其层级式方法匹配规则）===\n${buildSkillKnowledge(
        planSkill,
        { refs: 'none' }
      )}\n=== 技能说明结束 ===\n`
    : '';

  const draftPrompt = `当前任务：根据已确认的研究问题，推荐一个具体可执行的研究方案。
${buildContextDescription(ctx)}

可选研究方法（从这些里挑最适合的，必要时可组合）：用户访谈 / 问卷调研 / 可用性测试 / 日记研究 / 焦点小组 / 桌面研究 等。
${skillSection}${planMethodology}
${PLAN_METHODOLOGY_RULES}

${PLAN_MIXED_RULES}

${CLARIFY_INSTRUCTION}

${PLAN_RESULT_FORMAT}`;
  const draft = normalizeClarify(
    await deepseekJson<ClarifyResponse<ResearchPlanResult>>(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: draftPrompt }
      ],
      { temperature: 0.5, maxTokens: 6000 }
    )
  );
  if (draft.kind !== 'result' || !planSkill) return draft;

  // 第二段：按命中方法注入参考文件，细化样本量 / 配额 / 内容概览
  try {
    const refNames = pickPlanReferences(draft.result);
    const refKnowledge = buildSkillKnowledge(planSkill, { refs: refNames });
    const refinePrompt = `当前任务：细化下面这份研究方案草稿。
${buildContextDescription(ctx)}

=== 方案草稿（第一轮方法匹配的结果）===
${JSON.stringify(draft.result, null, 2)}
=== 草稿结束 ===

=== 命中方法的参考资料（research-plan-generator 技能 references，请以此为准细化）===
${refKnowledge}
=== 参考资料结束 ===

细化要求：
- 保持草稿的方法选择、阶段划分、嵌入技术完全不变，只做细化与校准。
- 依据参考资料校准：样本量与画像（sample）、周期（duration）、研究内容概览（contentOutline 的模块划分、时长与核心探针）、嵌入任务描述。
- 如果草稿中某个字段已经与参考资料一致，原样保留。
- ${PLAN_SCHEMA_OVERRIDE}

输出完整的最终方案（不是差量），必须输出 kind 为 "result"：
${PLAN_RESULT_FORMAT}`;
    const refined = await deepseekJson<ClarifyResponse<ResearchPlanResult>>(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: refinePrompt }
      ],
      { temperature: 0.3, maxTokens: 6000 }
    );
    if (refined.kind === 'result' && refined.result?.method) {
      return refined;
    }
    return draft;
  } catch {
    // 细化失败不阻断流程，回退到第一段草稿
    return draft;
  }
};

export const generateExecutionGuide = async (
  ctx: StageContext,
  focusedPlan?: ResearchSubPlan
): Promise<ClarifyResponse<ExecutionGuideResult>> => {
  const focusedOutlineLines = focusedPlan
    ? [
        ...(focusedPlan.embeddedTechniques?.length
          ? [`- 该方法承载的嵌入技术：${focusedPlan.embeddedTechniques.join('、')}`]
          : []),
        ...describeContentOutline(focusedPlan.contentOutline, '')
      ].join('\n')
    : '';
  const focusedDescription = focusedPlan
    ? `\n本次生成的执行指南，仅针对下方这个【单一】子方法，不要混入其他方法的内容：\n- 方法：${focusedPlan.method}\n- 方法类型：${focusedPlan.methodCategory}\n- 该方法独立的样本量与画像：${focusedPlan.sample}\n- 该方法独立的周期：${focusedPlan.duration}\n- 该方法在整体研究中的角色：${focusedPlan.purpose}\n${focusedOutlineLines ? `${focusedOutlineLines}\n` : ''}\n严格要求：\n- recruitment.totalSample 必须等于上面"该方法独立样本量"中明确给出的人数；如果原文是 "8 人"，那么 totalSample 必须是 8；不要把其它子方法的样本相加进来。\n- recruitment 的所有 quotas 配额之和应当等于 totalSample。\n- outline、cautions、recordTemplateColumns 都必须只服务该单一方法，例如访谈方法就只写访谈相关，问卷方法就只写问卷题目和板块。\n- 不要在指南里出现"另外做问卷"等跨方法的描述。`
    : '';

  // 解析当前方法对应的"研究方法技能"。优先用聚焦子方法，否则用整体方案。
  const methodCategory =
    focusedPlan?.methodCategory ?? ctx.confirmedResearchPlan?.methodCategory;
  const methodName = focusedPlan?.method ?? ctx.confirmedResearchPlan?.method;
  const matchedSkill = findSkillForMethod(methodCategory, methodName);
  const skillKnowledge = matchedSkill
    ? `\n\n=== 研究方法技能（请严格依据以下技能说明来设计本次执行指南；technique 细节、题型、模型规则、参考资料都要落实到输出中）===\n${buildSkillKnowledge(
        matchedSkill
      )}\n=== 技能说明结束 ===\n\n请把上述技能的方法论、结构骨架、题项规范与参考模型，转化到下方要求的 JSON 字段里（例如问卷类技能：outline.sections 表示问卷板块，questions 表示按规范编写的题目；recordTemplateColumns 贴合该方法）。`
    : '';
  const userPrompt = `当前任务：根据已确认的研究方案，输出可直接执行的完整指南。
${buildContextDescription(ctx)}${focusedDescription}${skillKnowledge}

要求：
- 用户招募部分必须给出可量化的配额（例如年龄分布、行业分布等），并给出筛选标准。
- 提纲部分要按阶段划分，每个问题包含可选追问。如果研究方案给出了"研究内容概览"（contentOutline），outline.sections 必须以其话题模块为骨架：每个模块对应一个 section，保留模块名与时长，并在最前和最后补充"开场"和"收尾"两个 section。
- 每个 section 标注 organizingMethod：默认 "标准CBA"；涉及用户选择/切换/决策的模块用 "JTBD"；涉及端到端体验回溯的模块用 "旅程回溯"；卡片分类任务模块用 "卡片分类任务"；问卷类方法可写 "问卷板块"。嵌入技术只作用于对应的话题模块，不影响其他模块。
- 访谈类题目按 CBA 原则编写：leadIn（铺垫问题，从简单具体处切入）、question（核心问题）、followUps（追问链）、purpose（设置目的，映射研究目标）、cbaType（"C" 情景 / "B" 行为+原因 / "A" 态度+建议）。严禁禁忌题目：否定性假设、未来预测、让用户定价、让用户设计、双重问题、含价值判断的措辞。
- 如果研究方法是访谈类（interview / focus_group），必须输出 probingGuide（探询指南）：threeSixty（上推/平移/下切）、orid（O/R/I/D 各层典型问法）、projective（拟人法/联想法/第三人称法/完成法）、specialUsers（好奇用户/专家用户/佛系用户应对）。其它方法可省略 probingGuide。
- 执行注意事项要落地（例如录音征得同意、避免诱导性提问、记录关键证据等）。
- recordTemplateColumns 用于生成访谈/调研记录的 CSV 表头，需贴合该研究方法。
- 如果信息明显不足，请仍然使用 clarify 形式。
- 如果研究方法是问卷类，"outline.sections" 可表示问卷的板块，questions 表示具体问题。
- 特别注意：技能文档内部展示的 JSON 结构（modules / lead_in / core_question 等 snake_case 字段）只是方法论说明，你的最终输出必须且只能使用下方 result 输出格式中的字段名（camelCase），不得混用。

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
          "organizingMethod": "标准CBA",
          "questions": [
            {
              "id": "q1",
              "topic": "破冰",
              "question": "...",
              "followUps": ["..."],
              "leadIn": "...（铺垫问题，可省略）",
              "purpose": "...（设置目的）",
              "cbaType": "C"
            }
          ]
        }
      ]
    },
    "cautions": ["...", "..."],
    "recordTemplateColumns": ["受访者编号", "年龄", "...", "Q1 回答", "Q2 回答", "关键洞察", "情绪标签"],
    "probingGuide": {
      "threeSixty": [ { "direction": "上推", "usage": "总结归纳、提炼高度", "example": "您分享的这些，如果用一句话概括……" } ],
      "orid": [ { "level": "O — 事实", "questions": ["你看到了什么？当时页面是什么样的？"] } ],
      "projective": [ { "technique": "拟人法", "example": "如果把这个产品想象成一个人，他是什么性格？" } ],
      "specialUsers": [ { "userType": "佛系用户", "strategy": "用对比制造思考张力……" } ]
    }
  }
}`;
  const resp = await deepseekJson<ClarifyResponse<ExecutionGuideResult>>(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.55, maxTokens: 6000 }
  );
  return normalizeClarify(resp);
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
