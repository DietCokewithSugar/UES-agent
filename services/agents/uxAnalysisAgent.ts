/**
 * ux-analysis agent —— 把 `skills/ux-analysis` 技能套壳成一场对话。
 *
 * 技能是 6 步、12 个确认节点的引导式流程（研究背景 → 数据上传识别 → 分析方案 →
 * 分析执行与主题聚类 → 主题审查 → 分析结论生成），并且硬性要求
 * **每个节点必须先提问并停止输出，等用户答复后才能继续**。
 *
 * 所以这里不把 6 步写死在 TS 里：控制轮把 SKILL.md 正文 + 当前对话 + 已上传的数据清单
 * 交给模型，让它自己判断走到哪一步、该问什么；代码只提供动作词汇表与轨道。
 * 技能改了流程，这个文件不用动。
 *
 * 产出走技能自带的 analysis.json 协议（见 scripts/analysis_builder.py），
 * 由 services/analysis/parseAnalysisJson.ts 解析、blocksToDocx 的 analysis 主题渲染。
 */
import { describeAttachmentsForPrompt, type Attachment } from '../../utils/attachments';
import {
  deepseekChatStream,
  deepseekJson,
  type DeepSeekContentBlock,
  type DeepSeekMessage
} from '../deepseekService';
import { buildSkillKnowledge, getSkill, type SkillMeta } from '../skills/skillRegistry';
import { normalizeAgentAction } from './normalizeAction';
import type {
  AgentContext,
  AgentDefinition,
  ControlTurnResult,
  GenerateOptions,
  GenerateTurnResult
} from './types';
import type { Deliverable, SkillTrace } from '../uxkit/types';

const SKILL_ID = 'ux-analysis';

/** 技能全程 12 个交互节点，留足余量；到顶强制收敛到产出。 */
const MAX_ROUNDS = 14;

const getAnalysisSkill = (): SkillMeta => {
  const skill = getSkill(SKILL_ID);
  if (!skill) {
    throw new Error(`技能 ${SKILL_ID} 未安装：请确认 skills/${SKILL_ID}/SKILL.md 存在。`);
  }
  return skill;
};

/**
 * 控制轮注入的参考文件。
 *
 * 技能的 references 加起来很大，控制轮只需要"研究类型判定"与"框架判定"这两张表
 * 就能完成 Step 1/3 的决策；各数据类型的分析引擎留到产出轮再按实际数据类型注入。
 */
const CONTROL_REFS = ['research_types.md', 'frameworks.md'];

/** 数据类型 → 分析引擎参考文件。对应 SKILL.md「References 速查」。 */
const ENGINE_REFS: { pattern: RegExp; file: string }[] = [
  { pattern: /问卷|调查|survey|量表|满意度|nps/i, file: 'questionnaire.md' },
  { pattern: /访谈|interview|逐字稿|转录/i, file: 'interview.md' },
  { pattern: /埋点|行为|漏斗|转化|analytics/i, file: 'analytics.md' },
  { pattern: /可用性|usability|任务测试/i, file: 'usability.md' },
  { pattern: /眼动|热区|aoi|注视|eyetracking/i, file: 'eyetracking.md' },
  { pattern: /用户声音|评论|投诉|工单|反馈|voc/i, file: 'user_voice.md' }
];

/** 产出轮的注入预算，口径与 ux-kit 的 referencePicker 一致。 */
const REF_CHAR_BUDGET = 45_000;

/**
 * 按附件与对话内容挑产出轮要注入的分析引擎。
 * 命中的文件名会原样显示在界面的技能调用轨迹上。
 */
const pickGenerateRefs = (skill: SkillMeta, haystack: string): string[] => {
  const hit = ENGINE_REFS.filter(e => e.pattern.test(haystack)).map(e => e.file);
  // 一份分析结论总要用到跨源综合与结论模板
  const wanted = [...hit, 'synthesis.md', 'analysis_template.md', 'frameworks.md'].filter(
    (f, i, arr) => arr.indexOf(f) === i
  );

  const out: string[] = [];
  let used = 0;
  for (const name of wanted) {
    const asset = skill.references.find(r => r.name === name);
    if (!asset) continue;
    if (used + asset.content.length > REF_CHAR_BUDGET) continue;
    out.push(name);
    used += asset.content.length;
  }
  return out;
};

const SYSTEM_PROMPT = `你是 ux-analysis —— 一名资深用户研究分析专家，把问卷 / 访谈 / 埋点 / 可用性评估 / 眼动 / 用户声音等原始研究数据，变成专业的分析结论。
你必须用简体中文回答。
你的全部行为严格遵循下面注入的 ux-analysis 技能文档的 6 步流程与 12 个交互节点。`;

const CONTROL_RULES = `你现在处于**控制轮**。输出严格 JSON，不要 markdown 围栏、不要多余解释。

技能规定：**每个节点必须先提问并停止，等用户答复后才能进入下一步**，不得自问自答替用户做选择。所以每次控制轮**只推进一个节点**。

从下面五种动作里选一个：

【1. 提问】需要用户决策/确认时（技能的 12 个交互节点大多是这种）：
{
  "action": "ask",
  "question": "一句话说明当前状态 + 你要问什么",
  "multiple": false,
  "options": [{ "id": "A", "title": "简短选项名", "description": "这个选项意味着什么" }],
  "note": "可选补充说明"
}
- 技能要求每个节点给 2~4 个参考选项；选项之间互斥时 multiple 为 false，可同时成立时为 true。
- **不要**写"以上都不是""其他（请描述）"——界面已内置自定义补充输入框和跳过按钮。

【2. 要数据文件】Step 2 需要用户上传数据时：
{ "action": "request_files", "prompt": "请上传……", "hint": "命名建议：数据类型_描述.扩展名，如 问卷_满意度调查.xlsx" }
用户还没上传任何数据、而流程需要数据时用这个。已经有数据了就不要重复要。

【3. 提案确认】需要把你的判断整体摆给用户确认时（研究类型确认 / 数据清单确认 / 分析方案确认 / 主题结构审查）：
{
  "action": "propose",
  "proposal": {
    "title": "卡片标题，如「数据清单确认」",
    "badge": "Step 2",
    "summary": "可选，一句话概述",
    "fields": [{ "label": "研究类型", "value": "体验评估 + 竞品分析" }],
    "items": [{ "title": "问卷_满意度调查.xlsx", "detail": "问卷数据 · 156 行 · 含 3 道开放题" }],
    "note": "可选说明",
    "confirmLabel": "确认，继续",
    "reviseLabel": "需要调整"
  }
}

【4. 生成分析结论】所有确认节点都过了、可以产出时：
{ "action": "generate", "deliverables": [{ "kind": "researchPlan", "filename": "[主题]分析结论.docx", "summary": "覆盖哪些核心结论" }] }
（kind 固定填 "researchPlan"，本技能只产出一份分析结论文件。）

【5. 收尾】流程结束、无需再产出时：
{ "action": "done", "text": "给用户的一句话收尾" }`;

const buildControlSystem = (skill: SkillMeta): string =>
  [
    SYSTEM_PROMPT,
    '',
    '=== ux-analysis 技能文档（必须严格遵循）===',
    buildSkillKnowledge(skill, { refs: CONTROL_REFS }),
    '',
    CONTROL_RULES
  ].join('\n');

/** 数据清单摘要，让模型知道手上有什么数据（Step 2 的识别依据）。 */
const describeDataInventory = (attachments: Attachment[]): string => {
  if (attachments.length === 0) return '（用户尚未上传任何数据文件）';
  return attachments
    .map(a => {
      const size = a.kind === 'image' ? '图片' : `${(a.text?.length ?? 0).toLocaleString()} 字符`;
      return `- ${a.name}（${a.kind === 'image' ? '图片' : a.kind === 'sheet' ? '表格' : a.kind === 'unsupported' ? '无法解析' : '文本'}，${size}）${a.note ? ` — ${a.note}` : ''}`;
    })
    .join('\n');
};

/**
 * 把附件挂到最后一条 user 消息上。
 * 图片走 image_url 内容块（视觉模型读），文本类直接拼进文本。
 */
const attachToLastUserMessage = (
  history: DeepSeekMessage[],
  attachments: Attachment[]
): DeepSeekMessage[] => {
  if (attachments.length === 0) return history;
  const images = attachments.filter(a => a.kind === 'image' && a.dataUrl);
  const textual = attachments.filter(a => a.kind !== 'image');

  const extra: string[] = [];
  if (textual.length) {
    extra.push(`=== 用户上传的数据文件 ===\n${describeAttachmentsForPrompt(textual)}`);
  }

  const out = [...history];
  const lastUserIdx = out.map(m => m.role).lastIndexOf('user');
  const target = lastUserIdx >= 0 ? lastUserIdx : out.length;

  const baseText =
    lastUserIdx >= 0
      ? typeof out[target].content === 'string'
        ? (out[target].content as string)
        : (out[target].content as DeepSeekContentBlock[])
            .filter(b => b.type === 'text')
            .map(b => (b as { text: string }).text)
            .join('\n')
      : '';

  const text = [baseText, ...extra].filter(Boolean).join('\n\n');

  if (images.length === 0) {
    const msg: DeepSeekMessage = { role: 'user', content: text };
    if (lastUserIdx >= 0) out[target] = msg;
    else out.push(msg);
    return out;
  }

  const blocks: DeepSeekContentBlock[] = [
    { type: 'text', text: text || '（见附图）' },
    ...images.map(a => ({ type: 'image_url' as const, image_url: { url: a.dataUrl! } }))
  ];
  const msg: DeepSeekMessage = { role: 'user', content: blocks };
  if (lastUserIdx >= 0) out[target] = msg;
  else out.push(msg);
  return out;
};

const runControlTurn = async (ctx: AgentContext): Promise<ControlTurnResult> => {
  const skill = getAnalysisSkill();
  const forceConverge = ctx.rounds >= MAX_ROUNDS;

  const messages: DeepSeekMessage[] = [
    { role: 'system', content: buildControlSystem(skill) },
    ...attachToLastUserMessage(ctx.history, ctx.attachments),
    {
      role: 'user',
      content: `（系统状态，不是用户发言）\n当前数据清单：\n${describeDataInventory(
        ctx.attachments
      )}\n已交互轮次：${ctx.rounds}${
        forceConverge
          ? '\n已达交互上限，请不要再提问，直接给出 action:"generate"。'
          : ''
      }`
    }
  ];

  const trace: SkillTrace = {
    skillId: skill.id,
    skillName: skill.name,
    phase: forceConverge ? '收敛到产出' : '引导式交互（Step 1–5）',
    templates: [],
    references: CONTROL_REFS
  };

  const action = await normalizeAgentAction(retryHint =>
    deepseekJson(
      retryHint ? [...messages, { role: 'user', content: `（系统提示：${retryHint}）` }] : messages,
      { temperature: retryHint ? 0.2 : 0.35, maxTokens: 2500, signal: ctx.signal }
    )
  );
  return { action, trace };
};

const GENERATE_RULES = `你现在处于**产出轮**：生成最终的分析结论。

**只输出一个 JSON 对象**，不要 markdown 围栏、不要任何解释文字。结构如下（协议来自技能的 scripts/analysis_builder.py）：

{
  "title": "XX产品用户研究分析结论",
  "subtitle": "生成日期：YYYY-MM-DD ｜ 方案类型",
  "blocks": [
    { "type": "heading", "text": "一、研究概述", "level": 1 },
    { "type": "paragraph", "text": "正文段落" },
    { "type": "bullets", "items": ["要点一", "要点二"] },
    { "type": "conclusion",
      "statement": "一句话结论",
      "data": ["关键数据1（问卷 N=156）", "关键数据2（受访者 P03）"],
      "interpretation": "原因解读",
      "confidence": "结论可信度：高（问卷 + 埋点 + 访谈多源收敛）" },
    { "type": "table", "title": "参与者概况", "headers": ["维度","人数","占比"], "rows": [["男",80,"51%"]] },
    { "type": "chart", "spec": { "type": "bar", "title": "各功能满意度对比",
        "labels": ["注册","登录"], "series": [["平均分",[2.8,3.5]]], "figsize": [7,4] },
      "caption": "图1 各功能满意度对比" },
    { "type": "pagebreak" }
  ]
}

硬性要求：
- **副标题只允许两项**：生成日期 + 方案类型，绝不能出现样本量/数据来源/研究方法等数据信息（那些写进正文"研究概述"）。
- **每条核心结论都用 conclusion 块**，章节标题直接用主题名（如"注册流程门槛较高"），不要出现"主题/聚类/三角验证/编码/L1/L2/L3"这些内部术语。
- 行动建议用 bullets 逐条展示，不要用表格。
- 所有引用必须标数据来源（如"问卷N=156"、"受访者P03"）；全文隐私脱敏，不出现真实姓名/手机号/账号。
- chart 的 figsize 等数组用 JSON 数组 \`[7, 4]\`，不能写成 \`(7, 4)\`。
- 图表类型只能是 bar / line / pie / scatter / funnel / radar。`;

const runGenerateTurn = async (
  ctx: AgentContext,
  deliverable: Deliverable,
  opts: GenerateOptions = {}
): Promise<GenerateTurnResult> => {
  const skill = getAnalysisSkill();
  const haystack = [
    ...ctx.attachments.map(a => `${a.name} ${a.note ?? ''}`),
    ...ctx.history.map(m => (typeof m.content === 'string' ? m.content : '')).slice(-12)
  ].join(' ');
  const refs = pickGenerateRefs(skill, haystack);

  const trace: SkillTrace = {
    skillId: skill.id,
    skillName: skill.name,
    phase: 'Step 6 分析结论生成',
    templates: [],
    references: refs
  };

  const system = [
    SYSTEM_PROMPT,
    '',
    '=== ux-analysis 技能文档与本次要用的分析引擎（必须严格遵循）===',
    buildSkillKnowledge(skill, { refs }),
    '',
    GENERATE_RULES
  ].join('\n');

  const messages: DeepSeekMessage[] = [
    { role: 'system', content: system },
    ...attachToLastUserMessage(ctx.history, ctx.attachments),
    {
      role: 'user',
      content: [
        `请基于以上全部确认结果与数据，生成《${deliverable.filename}》。`,
        deliverable.summary ? `内容概览：${deliverable.summary}` : '',
        opts.feedback ? `\n=== 用户对上一版的修改意见（必须落实）===\n${opts.feedback}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    }
  ];

  const { text, truncated } = await deepseekChatStream(messages, {
    temperature: 0.4,
    maxTokens: 8000,
    onDelta: opts.onDelta,
    signal: opts.signal ?? ctx.signal
  });

  return { raw: text.trim(), format: 'analysisJson', truncated, trace };
};

export const uxAnalysisAgent: AgentDefinition = {
  id: 'ux-analysis',
  skillId: SKILL_ID,
  nav: {
    title: 'AI 分析助手',
    tagline: '由 DeepSeek 驱动 · 调用 ux-analysis 技能，把研究数据变成分析结论',
    wordmark: 'ux·analysis',
    intro:
      '上传问卷 / 访谈 / 埋点 / 可用性评估 / 眼动 / 用户声音数据，我会逐步跟你确认研究背景、数据清单与分析方案，再按研究主题组织出一份 Word 分析结论。',
    landing: {
      heading: 'AI 分析助手 — 数据回来了，把它变成结论',
      description:
        '上传问卷、访谈逐字稿、埋点、可用性测试记录、眼动热区图或用户声音，AI 按研究主题（而不是按数据源）组织分析，多源交叉验证，产出带核心结论与图表的 Word 文档。',
      bullets: [
        '· 支持 xlsx / csv / docx / pdf / txt / 图片',
        '· 每一步都跟你确认，不黑箱输出',
        '· 多源三角验证，标注结论可信度',
        '· 产出 .docx，含图表与行动建议'
      ],
      cta: '进入 AI 分析助手'
    }
  },
  composer: {
    placeholder: '继续补充，或上传更多数据…',
    emptyPlaceholder: '说说这次研究要回答什么问题，并把数据文件传上来…',
    acceptsFiles: true,
    accept:
      '.xlsx,.csv,.tsv,.txt,.md,.docx,.pdf,.json,.log,image/png,image/jpeg,image/gif,image/webp'
  },
  runControlTurn,
  runGenerateTurn
};
