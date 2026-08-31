/**
 * ux-kit 编排层 —— 把 `skills/ux-kit` 这个技能"套壳"成一场对话。
 *
 * 分两种轮次，各自失败可独立重试：
 *
 *   控制轮 runControlTurn   非流式 + json_object。做 Phase 0 输出模式识别与
 *                           Phase 1 多轮澄清，返回 `ask`（继续追问）或
 *                           `confirm_intent`（给出研究问题陈述请用户确认）。
 *                           只注入 SKILL.md 正文 + references/question-templates.md。
 *
 *   产出轮 runGenerateTurn  流式 + 纯 markdown。按已确认的 IntentSummary 产出一份材料。
 *                           注入 SKILL.md 正文 + 该模式的那一个 template +
 *                           referencePicker 挑出的参考文件。
 *
 * 为什么不用 DeepSeek 的 function calling：这里的"工具"只有一个（追问），
 * 调用时机完全由 Phase 0/1/2 状态机决定，不需要模型自由选工具；
 * 而在同一条流里既解析 tool_calls 增量分片、又产出上万字 markdown，容错成本高得多。
 */
import {
  deepseekChatStream,
  deepseekJson,
  type DeepSeekMessage
} from '../deepseekService';
import { buildSkillKnowledge, getSkill, type SkillMeta } from '../skills/skillRegistry';
import { isRepeatedQuestion, normalizeControlAction } from './normalize';
import {
  CONTROL_REFS,
  DELIVERABLE_BY_MODE,
  describeMethodHints,
  pickAssetsForDeliverable
} from './referencePicker';
import {
  KIND_LABELS,
  MODE_LABELS,
  MODE_PHASE_LABELS,
  type ControlAction,
  type Deliverable,
  type DeliverableKind,
  type IntentSummary,
  type SkillTrace,
  type UxKitMode
} from './types';

export const UX_KIT_SKILL_ID = 'ux-kit';

/** 仅作为异常对话的安全上限，不代表需要追问到固定轮数。 */
export const MAX_CLARIFY_ROUNDS = 5;

export const getUxKitSkill = (): SkillMeta => {
  const skill = getSkill(UX_KIT_SKILL_ID);
  if (!skill) {
    throw new Error(
      `技能 ${UX_KIT_SKILL_ID} 未安装：请确认 skills/${UX_KIT_SKILL_ID}/SKILL.md 存在。`
    );
  }
  return skill;
};

const SYSTEM_PROMPT = `你是 ux-kit —— 一名资深用户体验研究专家，擅长把非专业人士一句话的模糊诉求，变成可直接执行的研究材料。
你必须用简体中文回答。
你的全部行为都严格遵循下面注入的 ux-kit 技能文档：Phase 0 输出模式识别 → Phase 1 问题澄清 → Phase 2 按模式产出。`;

const CONTROL_OUTPUT_RULES = `你现在处于**控制轮**，只做两件事之一，输出严格 JSON，不要 markdown 围栏、不要多余解释。

先把用户本轮输入、全部历史信息与技能要求合并评估，再决定动作。**宁可先确认，不要带着疑问替用户做决定**：
- 只要对研究对象、目标人群、研究目标、研究范围中的任何一项存在实质疑问，就必须使用 ask，得到用户答复后再继续。
- “可以猜到”不等于“已经明确”。不得擅自用常见人群、通用研究目标或默认研究范围补齐用户没有表达的内容。
- **不要问用户"想要哪份材料 / 最终产出什么"**——产出物由 Phase 0 从用户原话判定，没有明确产物词就是 "plan"（技能的安全兜底）。技能 Phase 1 的澄清维度表里没有"期望产出"这一维。
- 用户没指定产出物时，该澄清的是研究目标与范围，不是交付物；若研究目标或范围仍模糊，必须先追问，不能直接把 mode 设为 plan 来绕过澄清。
- 约束、样本量、时长、渠道仅在会改变研究设计或用户提到了相关限制时才需要确认；无关的可选细节不必盘问。
- 如果所有核心信息都已明确，首次控制轮即可给出意图确认，不得为了凑步骤继续追问。
- 用户已经明确说过的信息不得换一种说法重复询问；最终仍要通过意图确认卡让用户统一确认。

【A. 继续追问】存在任何会影响研究设计或产出判断的疑问时：
{
  "action": "ask",
  "question": "一个针对性的澄清问题，一次只问一个核心维度",
  "options": [
    { "id": "A", "title": "简短方向名", "description": "贴近用户原话场景的具体说明" }
  ],
  "note": "可选，一句话说明为什么问这个"
}
追问规则（对齐技能的 Phase 1）：
- options 给 2-6 个，id 依次用 "A"、"B"、"C"、"D"、"E"、"F"，不重复。
- 选项之间可以同时成立（界面是多选），描述要具体、互相区分。
- **不要**包含"跳过此问题""其他（请描述）""我不确定"之类的兜底项——界面已经内置了"跳过"按钮和自定义补充输入框。
- 选项里的括号示例必须贴近用户原话的场景，不要照抄模板里的例子。
- 设计模式/模型（Kano/ETS/量表）与嵌入技术（JTBD/卡片分类/灵犀旅程/眼动等）一律**自动判断，不要追问用户**。
- **同一个问题只问一次**：已经问过的维度，无论用户是作答、跳过还是回答"还不确定"，都按现有信息继续，不得换个说法再问一遍。用户答"不确定"就是把这一维交给你定。
- 不得按预设清单机械逐字段提问，也不得为了凑轮数继续；但不能因为希望少问，就替用户补写尚未明确的核心需求。

【B. 给出意图确认】核心信息均已明确，或用户明确授权“你帮我定”时：
{
  "action": "confirm_intent",
  "intent": {
    "mode": "questionnaire | interview | usability | plan",
    "statement": "一句话：研究对象 + 目标人群 + 研究意图",
    "subject": "研究对象",
    "audience": "目标人群",
    "intent": "研究意图",
    "constraints": ["约束条件，可为空数组"],
    "methodHints": ["自动判断出的方法信号，如 Kano / ETS / JTBD，可为空数组"],
    "deliverables": [
      { "kind": "questionnaire | interviewGuide | usabilityTest | researchPlan",
        "filename": "[主题]问卷.docx",
        "summary": "这份材料会包含哪些模块，一句话" }
    ],
    "uncertain": false
  }
}

**mode 与 deliverables 的对应关系是硬规则，必须遵守**（技能 Phase 0）：
- mode = "questionnaire" → deliverables 恰好一项，kind = "questionnaire"，文件名 "[主题]问卷.docx"
- mode = "interview"     → deliverables 恰好一项，kind = "interviewGuide"，文件名 "[主题]访谈提纲.docx"
- mode = "usability"     → deliverables 恰好一项，kind = "usabilityTest"，文件名 "[主题]可用性评估方案.docx"
- mode = "plan"          → deliverables 恰好一项，kind = "researchPlan"，文件名 "[主题]研究方案.docx"
  （方案模式下的后续材料等用户确认方案之后再生成，现在不要列进去）

**模式判定**（技能 Phase 0 的判定逻辑）：只有当用户**明确指定了产出物**（问卷/调查表/量表 → questionnaire；访谈/访谈提纲/访谈大纲 → interview；可用性测试/可用性评估/易用性测试/测试方案 → usability）时，才用对应模式；用户没有指定单一产出物、但研究对象、目标人群、研究目标和范围均已清楚时，才用 "plan"；同时要多种材料（"问卷和访谈都做"）也用 "plan"。
- **方法信号不参与模式路由**：Kano / ETS / JTBD / 灵犀旅程 / 卡片分类 / 眼动 等只说明研究内容，不是产物词；"体验评估""体验水平""了解需求"同理。它们只写进 methodHints，供方案模式内部匹配方法与挑选参考文件。
- 产出物模式**判定困难时用 "plan"**（技能的安全兜底）——但这只针对"要哪份材料"，**不能拿它绕过需求澄清**：研究对象/人群/目标/范围仍有实质疑问时，仍然先 ask。`;

const buildControlSystemPrompt = (skill: SkillMeta): string =>
  [
    SYSTEM_PROMPT,
    '',
    '=== ux-kit 技能文档（必须严格遵循）===',
    buildSkillKnowledge(skill, { refs: CONTROL_REFS }),
    '',
    CONTROL_OUTPUT_RULES
  ].join('\n');

export interface ControlTurnResult {
  action: ControlAction;
  trace: SkillTrace;
}

/**
 * 从摊平后的历史里取出已经问过的澄清问题。
 * `chatHistory.toDeepSeekMessages` 把每张澄清卡编码成一条 assistant JSON，这里按同一格式读回来。
 */
const askedQuestionsFrom = (history: DeepSeekMessage[]): string[] => {
  const out: string[] = [];
  for (const m of history) {
    // 带图片的消息 content 是 block 数组，那种不可能是控制轮 JSON
    if (m.role !== 'assistant' || typeof m.content !== 'string') continue;
    try {
      const parsed = JSON.parse(m.content) as { action?: string; question?: unknown };
      if (parsed?.action === 'ask' && typeof parsed.question === 'string') {
        out.push(parsed.question);
      }
    } catch {
      // 不是控制轮 JSON（例如"已生成《…》"那条），跳过
    }
  }
  return out;
};

/**
 * 跑一次控制轮。
 *
 * @param history      已摊平的多轮对话（真正的 user/assistant 交替，不再是把历史压成一个字符串）
 * @param roundsSoFar  已经追问过几轮，到 MAX_CLARIFY_ROUNDS 就强制收敛
 */
export const runControlTurn = async (
  history: DeepSeekMessage[],
  opts: {
    roundsSoFar: number;
    signal?: AbortSignal;
    onTrace?: (trace: SkillTrace) => void;
  } = { roundsSoFar: 0 }
): Promise<ControlTurnResult> => {
  const skill = getUxKitSkill();
  const forceConverge = opts.roundsSoFar >= MAX_CLARIFY_ROUNDS;

  const messages: DeepSeekMessage[] = [
    { role: 'system', content: buildControlSystemPrompt(skill) },
    ...history
  ];
  if (forceConverge) {
    messages.push({
      role: 'user',
      content: `（系统提示：已经追问 ${opts.roundsSoFar} 轮，达到上限。请不要再用 action:"ask"，直接输出 action:"confirm_intent"，给出当前最接近的解读；若仍有不确定，把 intent.uncertain 置为 true。）`
    });
  }

  const trace: SkillTrace = {
    skillId: skill.id,
    skillName: skill.name,
    phase: forceConverge ? 'Phase 1 问题澄清（收敛）' : 'Phase 0/1 模式识别与问题澄清',
    templates: [],
    references: CONTROL_REFS,
    steps: [
      {
        id: 'skill',
        kind: 'skill',
        label: '加载 ux-kit 技能',
        detail: '已读取技能说明与流程规则',
        status: 'done'
      },
      {
        id: 'refs',
        kind: 'tool',
        label: '读取澄清参考',
        detail: CONTROL_REFS.map(name => `references/${name}`).join('、'),
        status: 'done'
      },
      {
        id: 'context',
        kind: 'thinking',
        label: '理解对话上下文',
        detail: `已整理 ${history.length} 条上下文消息`,
        status: 'done'
      },
      {
        id: 'model',
        kind: 'tool',
        label: '调用 DeepSeek',
        detail: '正在判断是否需要澄清或确认需求',
        status: 'running'
      }
    ]
  };
  opts.onTrace?.(trace);

  const completeTrace = (action: ControlAction): void => {
    trace.steps = trace.steps?.map(step =>
      step.id === 'model' ? { ...step, status: 'done' as const } : step
    );
    trace.summary =
      action.action === 'ask'
        ? `当前仍有会影响研究设计的信息缺口，因此先确认「${action.question}」。`
        : `核心需求已足够明确，已整理为「${action.intent.statement}」供你最终确认。`;
    opts.onTrace?.({ ...trace, steps: trace.steps ? [...trace.steps] : undefined });
  };

  let raw: ControlAction;
  try {
    raw = await deepseekJson<ControlAction>(messages, {
      temperature: 0.4,
      maxTokens: 2000,
      signal: opts.signal
    });
  } catch (err) {
    // 重试一次，把解析错误回灌给模型
    raw = await deepseekJson<ControlAction>(
      [
        ...messages,
        {
          role: 'user',
          content: `（系统提示：上一次返回无法解析为 JSON——${(err as Error).message.slice(
            0,
            200
          )}。请只输出一个合法 JSON 对象，不要任何围栏或解释。）`
        }
      ],
      { temperature: 0.2, maxTokens: 2000, signal: opts.signal }
    );
  }

  const action = normalizeControlAction(raw);
  if (!action) throw new Error('AI 返回的控制指令无法识别，请重试。');

  // 模型偶尔会把问过的问题原样再抛一次（用户答"还不确定"之后尤其容易）。
  // 那张卡对用户毫无信息量，所以不转给界面，先要求模型收敛一次。
  if (!forceConverge && action.action === 'ask') {
    const asked = askedQuestionsFrom(history);
    if (isRepeatedQuestion(action.question, asked)) {
      const retry = await deepseekJson<ControlAction>(
        [
          ...messages,
          { role: 'assistant', content: JSON.stringify(action) },
          {
            role: 'user',
            content:
              '（系统提示：这个问题你已经问过，用户也已经作答或表示不确定，不要重复提问。' +
              '若剩余信息不影响产出，直接输出 action:"confirm_intent"；' +
              '用户没有明确指定产出物时 mode 用 "plan"。确有别的关键缺口才换一个维度问。）'
          }
        ],
        { temperature: 0.2, maxTokens: 2000, signal: opts.signal }
      );
      const corrected = normalizeControlAction(retry);
      // 纠正后仍在重复就收下原答案——宁可多问一次，也不要抛错打断对话
      if (
        corrected &&
        !(corrected.action === 'ask' && isRepeatedQuestion(corrected.question, asked))
      ) {
        completeTrace(corrected);
        return { action: corrected, trace };
      }
    }
  }

  completeTrace(action);
  return { action, trace };
};

const GENERATE_RULES = `你现在处于**产出轮**。直接输出这一份材料的完整 Markdown 正文，不要任何开场白、不要问用户问题、不要用代码围栏把整篇包起来。

格式要求：
- 第一行是 \`# 文档标题\`，之后按上面注入的模板骨架组织内容。
- 表格用标准 Markdown 表格（第二行必须是 \`|---|---|\` 分隔行）。
- 内容要完整可直接使用：不要写"[此处填写]""略"这类占位符。
- 方法名称标签（CBA / JTBD / ORID / 灵犀旅程 等）只用于你内部组织内容，**不得出现在产出文本里**。`;

const describeIntent = (intent: IntentSummary): string =>
  [
    `研究问题陈述：${intent.statement}`,
    `研究对象：${intent.subject}`,
    `目标人群：${intent.audience}`,
    `研究意图：${intent.intent}`,
    intent.constraints?.length ? `约束条件：${intent.constraints.join('；')}` : '',
    `方法信号（自动判断，仅用于组织内容，不要在正文里点名）：${describeMethodHints(
      intent.methodHints
    )}`,
    intent.uncertain ? '注意：需求仍存在不确定性，请在文档开头标注"存在不确定性，请复核"。' : ''
  ]
    .filter(Boolean)
    .join('\n');

export interface GenerateTurnResult {
  markdown: string;
  truncated: boolean;
  trace: SkillTrace;
}

/**
 * 跑一次产出轮，流式产出一份材料的 markdown。
 *
 * @param planMarkdown 方案模式下生成后续材料时，把已确认的研究方案带上，
 *                     让材料与方案的阶段划分对得上。
 */
export const runGenerateTurn = async (
  intent: IntentSummary,
  deliverable: Deliverable,
  opts: {
    onDelta?: (chunk: string) => void;
    onTrace?: (trace: SkillTrace) => void;
    planMarkdown?: string;
    feedback?: string;
    signal?: AbortSignal;
  } = {}
): Promise<GenerateTurnResult> => {
  const skill = getUxKitSkill();
  const picked = pickAssetsForDeliverable(skill, deliverable.kind, intent.methodHints);

  const phase =
    deliverable.kind === 'researchPlan'
      ? MODE_PHASE_LABELS.plan
      : MODE_PHASE_LABELS[
          (Object.keys(DELIVERABLE_BY_MODE) as UxKitMode[]).find(
            m => DELIVERABLE_BY_MODE[m] === deliverable.kind
          ) ?? 'plan'
        ];

  const trace: SkillTrace = {
    skillId: skill.id,
    skillName: skill.name,
    phase,
    templates: picked.templates,
    references: picked.references,
    steps: [
      {
        id: 'skill',
        kind: 'skill',
        label: '加载 ux-kit 技能',
        detail: phase,
        status: 'done'
      },
      {
        id: 'assets',
        kind: 'tool',
        label: '选择模板与参考资料',
        detail: `已读取 ${picked.templates.length} 个模板、${picked.references.length} 份参考资料`,
        status: 'done'
      },
      {
        id: 'compose',
        kind: 'thinking',
        label: '组织生成上下文',
        detail: opts.planMarkdown ? '已合并确认后的研究方案与修改意见' : '已合并确认后的研究需求',
        status: 'done'
      },
      {
        id: 'model',
        kind: 'tool',
        label: '调用 DeepSeek 流式生成',
        detail: `正在生成《${deliverable.filename}》`,
        status: 'running'
      }
    ]
  };
  opts.onTrace?.(trace);

  const system = [
    SYSTEM_PROMPT,
    '',
    '=== ux-kit 技能文档与本次产出要用的模板 / 参考资料（必须严格遵循）===',
    buildSkillKnowledge(skill, { refs: picked.references, templates: picked.templates }),
    picked.dropped.length
      ? `\n（注：${picked.dropped.join('、')} 因篇幅未注入，按通用规则处理。）`
      : '',
    '',
    GENERATE_RULES
  ]
    .filter(Boolean)
    .join('\n');

  const userParts = [
    `本次产出：《${deliverable.filename}》（${KIND_LABELS[deliverable.kind]}）`,
    `输出模式：${MODE_LABELS[intent.mode]}`,
    '',
    describeIntent(intent),
    deliverable.summary ? `\n用户已确认的内容概述：${deliverable.summary}` : '',
    opts.planMarkdown
      ? `\n=== 已确认的研究方案（本材料必须与其中对应阶段保持一致）===\n${opts.planMarkdown}`
      : '',
    opts.feedback ? `\n=== 用户对上一版的修改意见（必须落实）===\n${opts.feedback}` : ''
  ].filter(Boolean);

  const { text, truncated } = await deepseekChatStream(
    [
      { role: 'system', content: system },
      { role: 'user', content: userParts.join('\n') }
    ],
    {
      temperature: 0.5,
      maxTokens: 8000,
      onDelta: opts.onDelta,
      signal: opts.signal
    }
  );

  trace.steps = trace.steps?.map(step =>
    step.id === 'model' ? { ...step, status: 'done' as const, detail: '流式生成已完成' } : step
  );
  trace.summary = `已依据 ${picked.references.length} 份参考资料生成《${deliverable.filename}》。`;
  opts.onTrace?.({ ...trace, steps: trace.steps ? [...trace.steps] : undefined });
  return { markdown: text.trim(), truncated, trace };
};

/**
 * 方案确认后，从研究方案正文里推断出还要生成哪些材料。
 *
 * SKILL.md 2D Step D 规定：按阶段的数据采集方式决定生成哪份材料，
 * 用户声音分析阶段已随方案内嵌、不再单独出文件。
 */
export const derivePlanDeliverables = async (
  intent: IntentSummary,
  planMarkdown: string,
  opts: { signal?: AbortSignal } = {}
): Promise<Deliverable[]> => {
  const skill = getUxKitSkill();
  const messages: DeepSeekMessage[] = [
    {
      role: 'system',
      content: [
        SYSTEM_PROMPT,
        '',
        '=== ux-kit 技能文档 ===',
        buildSkillKnowledge(skill),
        '',
        `用户已确认下面这份研究方案。按技能 2D Step D 的规则，列出接下来要生成的材料，输出严格 JSON：
{ "deliverables": [ { "kind": "interviewGuide | questionnaire | usabilityTest", "filename": "[主题]访谈提纲.docx", "summary": "这份材料覆盖哪些模块" } ] }
规则：
- 每个研究阶段按其数据采集方式出一份材料：用户访谈 → interviewGuide；问卷调查 → questionnaire；可用性评估 → usabilityTest。
- **用户声音分析阶段不出文件**（声音分析计划已内嵌在方案里），不要列进来。
- 同一种采集方式在多个阶段出现时合并为一份材料。
- 文件名沿用方案里的主题，形如 "[主题]访谈提纲.docx"。`
      ].join('\n')
    },
    { role: 'user', content: planMarkdown }
  ];

  const parsed = await deepseekJson<{ deliverables?: Deliverable[] }>(messages, {
    temperature: 0.2,
    maxTokens: 1500,
    signal: opts.signal
  });

  const allowed: DeliverableKind[] = ['interviewGuide', 'questionnaire', 'usabilityTest'];
  const topic = (intent.subject || '用户研究').slice(0, 30);
  const seen = new Set<DeliverableKind>();
  return (parsed?.deliverables || [])
    .filter(d => allowed.includes(d?.kind))
    .filter(d => {
      if (seen.has(d.kind)) return false;
      seen.add(d.kind);
      return true;
    })
    .map(d => ({
      kind: d.kind,
      filename: d.filename?.endsWith('.docx')
        ? d.filename
        : `${topic}${KIND_LABELS[d.kind]}.docx`,
      summary: d.summary
    }));
};
