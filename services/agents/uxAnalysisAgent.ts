/**
 * ux-analysis agent —— 把 `skills/ux-analysis` 技能套壳成一场对话。
 *
 * 技能按研究背景 → 数据识别 → 分析执行 → 结论生成组织能力，但交互采用
 * 自适应聊天流程：模型先结合完整上下文与技能判断资料是否足够，仅在关键缺口
 * 或会改变分析方向的真实决策点询问用户。
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
  safeParseJson,
  type DeepSeekContentBlock,
  type DeepSeekMessage
} from '../deepseekService';
import { buildSkillKnowledge, getSkill, type SkillMeta } from '../skills/skillRegistry';
import { runAnalysisPipeline, type AnalysisBundle } from '../analysis/analysisPipeline';
import { parseAnalysisJson } from '../analysis/parseAnalysisJson';
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

/** 异常对话的安全上限，不代表必须经历固定轮数或固定卡片。 */
const MAX_ROUNDS = 8;

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
 * 控制轮只需研究类型与框架判定；数据计算引擎留到产出轮按实际内容注入。
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

const FRAMEWORK_SIGNAL =
  /卡诺|kano|画像|旅程|服务蓝图|心智模型|jtbd|客群|需求分析|功能架构|竞品|体验测试/i;

/**
 * 按附件与对话内容挑产出轮要注入的分析引擎。
 * 命中的文件名会原样显示在界面的技能调用轨迹上。
 */
const pickGenerateRefs = (skill: SkillMeta, haystack: string): string[] => {
  const hit = ENGINE_REFS.filter(e => e.pattern.test(haystack)).map(e => e.file);
  // 核心规范必须优先于体积较大的数据引擎
  const wanted = [
    'analysis_template.md',
    'synthesis.md',
    'research_types.md',
    ...(FRAMEWORK_SIGNAL.test(haystack) ? ['frameworks.md'] : []),
    // 原始计算已由分块流水线逐文件加载引擎完成；写作轮只保留一个最相关引擎，
    // 防止多源数据把全部大参考文件再次塞进同一上下文。
    ...hit.slice(0, 1)
  ].filter(
    (f, i, arr) => arr.indexOf(f) === i
  );

  return wanted.filter(name => skill.references.some(ref => ref.name === name));
};

const SYSTEM_PROMPT = `你是 ux-analysis —— 一名带专业技能的用户研究分析 AI 助手，把问卷 / 访谈 / 埋点 / 可用性评估 / 眼动 / 用户声音等原始研究数据，变成专业的分析结论。
你必须用简体中文回答。
你要完整运用注入的技能与参考资料，但交互方式是自然的 AI chatbot，而不是逐节点表单向导。
当前运行环境是浏览器 SPA，不执行技能目录中的 Python 脚本；你只负责输出 analysis.json，前端会用与脚本协议对齐的 TypeScript 图表和 Word 渲染器生成文件。`;

const CONTROL_RULES = `你现在处于**控制轮**。输出严格 JSON，不要 markdown 围栏、不要多余解释。

先结合用户输入、当前对话、上游带入的需求记忆、附件内容与技能要求，判断当前最合适的动作。

核心交互规则：
- **两道固定门禁，顺序不可颠倒、不可跳过**：
  1. **正式分析前**必须确认一次分析执行方案——已有数据且关键背景明确时，先返回 purpose:"analysis_plan" 的 propose；
  2. **生成结论前**必须确认一次分析摘要——方案确认后先把分析做完，再返回 purpose:"insight_review" 的 propose，把主题结构与洞察摊给用户看；
  两张卡都确认之后，才允许 action:"generate"。
- 固定确认卡就这两张，不要再串行展示研究类型确认、数据清单确认等例行卡片。
- ask 只用于无法可靠推断、且缺失后会让计算或结论明显不可靠的必要信息；可选字段缺失时采用专业默认值并在结论中说明限制。
- request_files 只用于没有可分析的数据；已有附件时不得重复索要。
- 除这两道门禁外，propose 只用于“用户必须做选择”或“AI 的关键判断存在实质歧义”的情况，不用于例行汇报每一步。
- 从 ux-kit 带入的需求摘要视为已确认背景，不追问方案全文，不重复确认已有字段。
- 研究类型、适用分析引擎、统计方法、图表与框架应优先由你根据技能和数据自动选择。
- 用户要求修改时吸收修改后继续，不要把同一张卡换个标题再次确认。

从下面五种动作里选一个：

【1. 提问】存在阻止可靠分析的关键缺口时：
{
  "action": "ask",
  "question": "一句话说明当前状态 + 你要问什么",
  "multiple": false,
  "options": [{ "id": "A", "title": "简短选项名", "description": "这个选项意味着什么" }],
  "note": "可选补充说明"
}
- 给 2~4 个参考选项；选项之间互斥时 multiple 为 false，可同时成立时为 true。
- **不要**写"以上都不是""其他（请描述）"——界面已内置自定义补充输入框和跳过按钮。

【2. 要数据文件】没有任何可分析数据时：
{ "action": "request_files", "prompt": "请上传……", "hint": "命名建议：数据类型_描述.扩展名，如 问卷_满意度调查.xlsx" }
用户还没上传任何数据、而流程需要数据时用这个。已经有数据了就不要重复要。

【3. 分析执行方案确认】数据上传完成后，正式分析前必须给出一次分析执行方案：
{
  "action": "propose",
  "proposal": {
    "purpose": "analysis_plan",
    "title": "分析执行方案",
    "badge": "分析前确认",
    "summary": "一句话说明本次分析如何回答研究目标",
    "fields": [
      { "label": "分析目标", "value": "本次重点回答的问题" },
      { "label": "分析方法", "value": "将采用的统计/定性/跨源方法" },
      { "label": "输出内容", "value": "结论、数据表、图表与建议" }
    ],
    "items": [{ "title": "执行步骤", "detail": "数据检查 → 计算与分析 → 主题综合 → 生成结论" }],
    "note": "说明数据限制或不会执行的分析（如有）",
    "confirmLabel": "确认方案，开始分析",
    "reviseLabel": "调整执行方案"
  }
}
- 方案必须结合实际附件与上游需求，不得只复述通用模板。
- 用户修改方案后，更新同一类方案并重新确认。

【4. 分析摘要确认】分析执行方案已确认、分析已经做完，生成结论前必须给出这一张（技能 Step 5）：
{
  "action": "propose",
  "proposal": {
    "purpose": "insight_review",
    "title": "分析摘要",
    "badge": "生成前确认",
    "summary": "一句话概括本次分析得出的整体图景",
    "fields": [
      { "label": "主题数量", "value": "共 N 个主题，按相关度 × 数据支撑 × 影响面排序" },
      { "label": "证据来源", "value": "各主题分别由哪些数据源支撑" },
      { "label": "结论可信度", "value": "高 / 中高 / 中 / 中低 / 低 的分布，单源永不为高" }
    ],
    "items": [
      { "title": "主题一：注册流程门槛较高", "detail": "支撑证据（问卷 N=156 / 受访者 P03…）＋ 洞察分级 L1/L2/L3；有言行矛盾时在此注明" }
    ],
    "note": "待验证洞察、证据薄弱之处，或用户可调整的方向（合并/拆分/重命名/增删主题、调整优先级、补充专业判断）",
    "confirmLabel": "结构 OK，生成结论",
    "reviseLabel": "调整主题或洞察"
  }
}
- items 必须逐条列真实主题，带上实际数据点，**不得只给"主题一/主题二"这种占位**。
- 主题名直接用结论式短语（如"注册流程门槛较高"），不要出现"聚类/三角验证/编码"这些内部术语。
- 用户要求调整时更新同一张摘要卡重新确认，不要换个标题再确认一遍。

【5. 生成分析结论】必要背景、可分析数据均已具备，且 analysis_plan 与 insight_review 两张卡都已确认时：
{ "action": "generate", "deliverables": [{ "kind": "researchPlan", "filename": "[主题]分析结论.docx", "summary": "覆盖哪些核心结论" }] }
（kind 固定填 "researchPlan"，本技能只产出一份分析结论文件。）

【6. 收尾】流程结束、无需再产出时：
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

/** 控制轮只读少量样本；正式分析由分块流水线读取全部数据。 */
const previewAttachments = (attachments: Attachment[]): Attachment[] => {
  let remainingText = 16_000;
  let remainingImages = 4;
  return attachments.map(attachment => {
    if (attachment.kind === 'image') {
      const include = remainingImages > 0;
      remainingImages -= 1;
      return include ? attachment : { ...attachment, dataUrl: undefined };
    }
    if (!attachment.text || remainingText <= 0) return { ...attachment, text: undefined };
    const text = attachment.text.slice(0, Math.min(4_000, remainingText));
    remainingText -= text.length;
    return { ...attachment, text };
  });
};

/**
 * 分块分析的目标上下文固定截止到分析方案，避免 insight_review 确认后因历史变长而重复计算。
 */
const buildAnalysisContext = (ctx: AgentContext): string => {
  const parts: string[] = [];
  for (const message of ctx.history) {
    if (typeof message.content !== 'string') continue;
    if (
      message.role === 'assistant' &&
      /"purpose"\s*:\s*"insight_review"/.test(message.content)
    ) {
      break;
    }
    if (message.content.startsWith('（已生成《')) continue;
    parts.push(`${message.role}: ${message.content}`);
  }
  return parts.join('\n').slice(-24_000);
};

const bundleForPrompt = (bundle: AnalysisBundle): string =>
  JSON.stringify({
    manifest: bundle.manifest,
    coverage: bundle.coverage,
    synthesis: bundle.synthesis,
    recommendedCharts: bundle.recommendedCharts
  });

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
  const hasConfirmedAnalysisPlan =
    ctx.milestones.confirmedProposalPurposes.includes('analysis_plan');
  const hasConfirmedInsightReview =
    ctx.milestones.confirmedProposalPurposes.includes('insight_review');
  // 交互上限只有在两道门禁都过了之后才允许收敛到产出，否则会绕过确认。
  const forceConverge =
    ctx.rounds >= MAX_ROUNDS &&
    ctx.attachments.length > 0 &&
    hasConfirmedAnalysisPlan &&
    hasConfirmedInsightReview;

  let analysisBundle: AnalysisBundle | null = null;
  if (
    hasConfirmedAnalysisPlan &&
    !hasConfirmedInsightReview &&
    ctx.attachments.some(attachment => attachment.kind !== 'unsupported')
  ) {
    const pipelineTrace: SkillTrace = {
      skillId: skill.id,
      skillName: skill.name,
      phase: 'Step 4 全量分块分析',
      templates: [],
      references: ['按数据类型渐进加载', 'synthesis.md'],
      steps: [
        {
          id: 'prepare',
          kind: 'tool',
          label: '拆分并检查全部数据',
          detail: `${ctx.attachments.length} 个附件，正在建立完整覆盖清单`,
          status: 'done'
        },
        {
          id: 'map-reduce',
          kind: 'thinking',
          label: '逐块分析与分层归并',
          detail: '正在执行',
          status: 'running'
        }
      ]
    };
    ctx.onTrace?.(pipelineTrace);
    analysisBundle = await runAnalysisPipeline(ctx.attachments, skill, {
      context: buildAnalysisContext(ctx),
      signal: ctx.signal,
      onProgress: (completed, total, phase) => {
        pipelineTrace.steps = pipelineTrace.steps?.map(step =>
          step.id === 'map-reduce'
            ? { ...step, detail: `${phase} · ${completed}/${total}` }
            : step
        );
        ctx.onTrace?.({ ...pipelineTrace, steps: [...(pipelineTrace.steps ?? [])] });
      }
    });
    pipelineTrace.steps = pipelineTrace.steps?.map(step =>
      step.id === 'map-reduce'
        ? {
            ...step,
            status: 'done' as const,
            detail: `已完整分析 ${analysisBundle?.coverage.analyzedChunks}/${analysisBundle?.coverage.totalChunks} 个数据块`
          }
        : step
    );
    pipelineTrace.summary = '原始数据已逐块读取，并按来源与证据口径完成分层归并。';
    ctx.onTrace?.({ ...pipelineTrace, steps: [...(pipelineTrace.steps ?? [])] });
  }

  const historyWithoutDocuments = compactHistory(ctx.history);
  const controlHistory = analysisBundle
    ? historyWithoutDocuments
    : attachToLastUserMessage(historyWithoutDocuments, previewAttachments(ctx.attachments));
  const messages: DeepSeekMessage[] = [
    { role: 'system', content: buildControlSystem(skill) },
    ...controlHistory,
    ...(analysisBundle
      ? [
          {
            role: 'user' as const,
            content: `（系统提供的 Step 4 全量分析结果，不是用户发言。必须据此生成真实的分析摘要，禁止重新估算原始数据。）\n${bundleForPrompt(
              analysisBundle
            )}`
          }
        ]
      : []),
    {
      role: 'user',
      content: `（系统状态，不是用户发言）\n当前数据清单：\n${describeDataInventory(
        ctx.attachments
      )}\n上游需求记忆：${ctx.milestones.hasHandoff ? '已带入并确认' : '无'}\n已确认提案：${
        ctx.milestones.confirmedProposals.length
          ? ctx.milestones.confirmedProposals.join('、')
          : '无'
      }\n分析执行方案（门禁①）：${
        hasConfirmedAnalysisPlan ? '已确认，可以开始正式分析' : '尚未确认，禁止 generate'
      }\n分析摘要（门禁②）：${
        hasConfirmedInsightReview
          ? '已确认，可以生成结论'
          : hasConfirmedAnalysisPlan
            ? '尚未确认，禁止 generate——请先做完分析，再返回 purpose:"insight_review" 的 propose'
            : '尚未确认（需先过门禁①）'
      }\n禁止再次询问或提议上述已确认事项。\n已交互轮次：${ctx.rounds}${
        forceConverge
          ? '\n已达交互安全上限且已有数据，请采用合理默认值，不要再提问，直接给出 action:"generate"。'
          : ''
      }`
    }
  ];

  const trace: SkillTrace = {
    skillId: skill.id,
    skillName: skill.name,
    phase: forceConverge ? '收敛到产出' : '评估资料完整性与下一步',
    templates: [],
    references: CONTROL_REFS,
    steps: [
      {
        id: 'skill',
        kind: 'skill',
        label: '加载 ux-analysis 技能',
        detail: '已读取完整分析流程与约束',
        status: 'done'
      },
      {
        id: 'refs',
        kind: 'tool',
        label: '读取分析框架',
        detail: CONTROL_REFS.map(name => `references/${name}`).join('、'),
        status: 'done'
      },
      {
        id: 'inventory',
        kind: 'tool',
        label: '检查数据与流程门禁',
        detail: `${ctx.attachments.length} 个附件 · 分析方案${
          hasConfirmedAnalysisPlan ? '已确认' : '待确认'
        } · 分析摘要${hasConfirmedInsightReview ? '已确认' : '待确认'}`,
        status: 'done'
      },
      {
        id: 'model',
        kind: 'thinking',
        label: '分析下一步',
        detail: 'DeepSeek 正在结合对话、附件与技能规则作出决策',
        status: 'running'
      }
    ]
  };
  ctx.onTrace?.(trace);

  let action = await normalizeAgentAction(retryHint =>
    deepseekJson(
      retryHint ? [...messages, { role: 'user', content: `（系统提示：${retryHint}）` }] : messages,
      { temperature: retryHint ? 0.2 : 0.35, maxTokens: 2500, signal: ctx.signal }
    )
  );

  // 确定性门禁：即使模型忽略提示，两道确认也都不能被绕过。
  const missingGate = !hasConfirmedAnalysisPlan
    ? ('analysis_plan' as const)
    : !hasConfirmedInsightReview
      ? ('insight_review' as const)
      : null;

  if (ctx.attachments.length > 0 && missingGate && action.action === 'generate') {
    trace.steps = [
      ...(trace.steps?.map(step =>
        step.id === 'model' ? { ...step, status: 'done' as const } : step
      ) ?? []),
      {
        id: 'gate',
        kind: 'tool',
        label: '执行流程门禁',
        detail:
          missingGate === 'analysis_plan'
            ? '已阻止跳过分析执行方案'
            : '已阻止跳过分析摘要确认',
        status: 'running'
      }
    ];
    ctx.onTrace?.({ ...trace, steps: [...trace.steps] });
    const gateMessage: DeepSeekMessage = {
      role: 'user',
      content:
        missingGate === 'analysis_plan'
          ? '（系统门禁：已有数据，但用户尚未确认分析执行方案。禁止 generate。请返回 action:"propose"，proposal.purpose 必须为 "analysis_plan"，title 必须为“分析执行方案”，并结合附件列出分析目标、方法、步骤、输出内容与数据限制。）'
          : '（系统门禁：分析执行方案已确认，但用户尚未确认分析摘要。禁止 generate。请先完成分析，再返回 action:"propose"，proposal.purpose 必须为 "insight_review"，title 必须为“分析摘要”，用 items 逐条列出真实主题（含支撑数据点与洞察分级 L1/L2/L3），fields 给出主题数量、证据来源与结论可信度分布。）'
    };
    action = await normalizeAgentAction(retryHint =>
      deepseekJson(
        retryHint
          ? [...messages, gateMessage, { role: 'user', content: `（系统提示：${retryHint}）` }]
          : [...messages, gateMessage],
        { temperature: retryHint ? 0.2 : 0.3, maxTokens: 2500, signal: ctx.signal }
      )
    );
    if (action.action === 'generate') {
      throw new Error(
        missingGate === 'analysis_plan'
          ? '分析执行方案尚未确认，已阻止提前开始分析。请重试。'
          : '分析摘要尚未确认，已阻止提前生成结论。请重试。'
      );
    }
  }
  trace.steps = trace.steps?.map(step =>
    step.status === 'running' ? { ...step, status: 'done' as const } : step
  );
  trace.summary =
    action.action === 'ask'
      ? `存在会影响分析可靠性的关键信息缺口，因此先确认「${action.question}」。`
      : action.action === 'request_files'
        ? '当前没有可分析的数据，下一步需要先补充原始资料。'
        : action.action === 'propose'
          ? `已结合现有数据形成「${action.proposal.title}」，需要你确认后继续。`
          : action.action === 'generate'
            ? '数据与两道确认门禁均已就绪，可以生成最终分析结论。'
            : '本轮分析流程已完成。';
  ctx.onTrace?.({ ...trace, steps: trace.steps ? [...trace.steps] : undefined });
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
    { "type": "image", "attachment": "眼动_首页热区图.png",
      "caption": "图2 首页眼动热区图", "widthInches": 6.2 },
    { "type": "pagebreak" }
  ]
}

硬性要求：
- **副标题只允许两项**：生成日期 + 方案类型，绝不能出现样本量/数据来源/研究方法等数据信息（那些写进正文"研究概述"）。
- **每条核心结论都用 conclusion 块**，章节标题直接用主题名（如"注册流程门槛较高"），不要出现"主题/聚类/三角验证/编码/L1/L2/L3"这些内部术语。
- 行动建议用 bullets 逐条展示，不要用表格。
- 所有引用必须标数据来源（如"问卷N=156"、"受访者P03"）；全文隐私脱敏，不出现真实姓名/手机号/账号。
- 需要引用用户上传的图片时使用 image 块，attachment 必须原样填写附件文件名；系统会嵌入原图，禁止编造 dataUrl。
- chart 的 figsize 等数组用 JSON 数组 \`[7, 4]\`，不能写成 \`(7, 4)\`。
- 图表类型只能是 bar / line / pie / scatter / funnel / radar。
- 输入中的 manifest/coverage 用于验证数据是否完整读取；不得声称只抽样读取。
- 输入中的 exactMetrics 与程序统计是数值事实锚点，禁止用语言模型重新估算。
- 输入中的 recommendedCharts 或 chartPlan 有可用量化数据时，至少输出一个 chart 块；只有纯定性数据确实没有可视化数值时才可不出图。`;

/** 把模型按文件名引用的图片替换为本地 data URL，避免让模型回显大段 base64。 */
const resolveAttachmentImages = (raw: string, attachments: Attachment[]): string => {
  const images = attachments.filter(a => a.kind === 'image' && a.dataUrl);
  if (images.length === 0) return raw;
  try {
    const parsed = JSON.parse(raw) as { blocks?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.blocks)) return raw;
    for (const block of parsed.blocks) {
      if (block?.type !== 'image' || typeof block.dataUrl === 'string') continue;
      const requested =
        typeof block.attachment === 'string' ? block.attachment.trim().toLocaleLowerCase() : '';
      const image =
        images.find(a => a.name.toLocaleLowerCase() === requested) ||
        (images.length === 1 ? images[0] : undefined);
      if (image?.dataUrl) block.dataUrl = image.dataUrl;
      delete block.attachment;
    }
    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
};

/**
 * 最终结构校验与图表兜底：量化数据存在时，即使模型漏写 chart 块，也使用程序遍历整表
 * 得到的精确频次生成一张图，避免“同样的数据有时有图、有时没图”。
 */
const finalizeAnalysisJson = (raw: string, bundle: AnalysisBundle): string => {
  const parsed = safeParseJson<{
    title?: string;
    subtitle?: string;
    blocks?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  }>(raw);
  if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) {
    throw new Error('分析结论缺少有效 blocks。');
  }
  const hasConclusion = parsed.blocks.some(block => block?.type === 'conclusion');
  if (!hasConclusion) throw new Error('分析结论缺少核心 conclusion 块。');

  const structurallyValid = parseAnalysisJson(parsed);
  const hasValidChart = structurallyValid.blocks.some(block => block.type === 'chart');
  if (!hasValidChart && bundle.recommendedCharts.length > 0) {
    // 删除会在解析时变成“图略”的坏 chart，避免坏图与兜底图同时出现。
    parsed.blocks = parsed.blocks.filter(block => block?.type !== 'chart');
    const spec = bundle.recommendedCharts[0];
    parsed.blocks.push({
      type: 'chart',
      spec,
      caption: `程序统计图：${spec.title ?? '关键数据分布'}`
    });
  }
  parsed.analysisCoverage = bundle.coverage;
  return JSON.stringify(parsed);
};

const compactHistory = (history: DeepSeekMessage[]): DeepSeekMessage[] =>
  history.filter(
    message =>
      !(
        message.role === 'assistant' &&
        typeof message.content === 'string' &&
        message.content.startsWith('（已生成《')
      )
  );

const runGenerateTurn = async (
  ctx: AgentContext,
  deliverable: Deliverable,
  opts: GenerateOptions = {}
): Promise<GenerateTurnResult> => {
  const skill = getAnalysisSkill();
  const haystack = [
    ...ctx.attachments.map(a => `${a.name} ${a.note ?? ''} ${a.text?.slice(0, 4_000) ?? ''}`),
    ...ctx.history.map(m => (typeof m.content === 'string' ? m.content : ''))
  ].join(' ');
  const refs = pickGenerateRefs(skill, haystack);

  const trace: SkillTrace = {
    skillId: skill.id,
    skillName: skill.name,
    phase: 'Step 6 分析结论生成',
    templates: [],
    references: refs,
    steps: [
      {
        id: 'skill',
        kind: 'skill',
        label: '加载 ux-analysis 技能',
        detail: 'Step 6 分析结论生成',
        status: 'done'
      },
      {
        id: 'engines',
        kind: 'tool',
        label: '匹配分析引擎',
        detail: `已读取 ${refs.length} 份相关分析规范`,
        status: 'done'
      },
      {
        id: 'data',
        kind: 'tool',
        label: '读取分块分析结果',
        detail: `正在校验 ${ctx.attachments.length} 个附件的数据覆盖`,
        status: 'running'
      },
      {
        id: 'model',
        kind: 'thinking',
        label: '生成分析结论',
        detail: `DeepSeek 正在流式生成《${deliverable.filename}》`,
        status: 'running'
      }
    ]
  };
  opts.onTrace?.(trace);

  const bundle = await runAnalysisPipeline(ctx.attachments, skill, {
    context: buildAnalysisContext(ctx),
    signal: opts.signal ?? ctx.signal,
    onProgress: (completed, total, phase) => {
      trace.steps = trace.steps?.map(step =>
        step.id === 'data' ? { ...step, detail: `${phase} · ${completed}/${total}` } : step
      );
      opts.onTrace?.({ ...trace, steps: [...(trace.steps ?? [])] });
    }
  });
  trace.steps = trace.steps?.map(step =>
    step.id === 'data'
      ? {
          ...step,
          status: 'done' as const,
          detail: `已覆盖 ${bundle.coverage.analyzedChunks}/${bundle.coverage.totalChunks} 个原始数据块`
        }
      : step
  );
  opts.onTrace?.({ ...trace, steps: [...(trace.steps ?? [])] });

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
    ...compactHistory(ctx.history),
    {
      role: 'user',
      content: `（系统提供的全量分块分析结果。它已覆盖全部原始数据；程序确定性统计优先于语言模型估算。必须只基于其中证据写作。）\n${bundleForPrompt(
        bundle
      )}`
    },
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

  let generated = await deepseekChatStream(messages, {
    temperature: 0.4,
    maxTokens: 8192,
    onDelta: opts.onDelta,
    signal: opts.signal ?? ctx.signal
  });
  let finalRaw: string;
  try {
    if (generated.truncated) throw new Error('模型输出达到长度上限');
    finalRaw = finalizeAnalysisJson(generated.text.trim(), bundle);
  } catch (error) {
    trace.steps = trace.steps?.map(step =>
      step.id === 'model'
        ? {
            ...step,
            detail: `首次结果不完整，正在自动修复：${(error as Error).message}`,
            status: 'running' as const
          }
        : step
    );
    opts.onTrace?.({ ...trace, steps: [...(trace.steps ?? [])] });
    generated = await deepseekChatStream(
      [
        ...messages,
        {
          role: 'user',
          content:
            '上一次输出被截断或结构校验失败。请重新生成一份更紧凑但完整的 JSON：保留全部核心结论、来源、限制与必要图表，减少重复描述。只输出合法 JSON。'
        }
      ],
      {
        temperature: 0.2,
        maxTokens: 8_192,
        signal: opts.signal ?? ctx.signal
      }
    );
    if (generated.truncated) throw new Error('自动修复后仍达到模型输出长度上限，请缩小输出范围。');
    finalRaw = finalizeAnalysisJson(generated.text.trim(), bundle);
  }

  trace.steps = trace.steps?.map(step =>
    step.id === 'model' ? { ...step, status: 'done' as const, detail: '分析结论生成完成' } : step
  );
  trace.summary = `已基于 ${bundle.coverage.analyzedChunks} 个完整数据块的分层分析结果生成《${deliverable.filename}》，并通过结构与图表校验。`;
  opts.onTrace?.({ ...trace, steps: trace.steps ? [...trace.steps] : undefined });
  return {
    raw: resolveAttachmentImages(finalRaw, ctx.attachments),
    format: 'analysisJson',
    truncated: false,
    trace
  };
};

export const uxAnalysisAgent: AgentDefinition = {
  id: 'ux-analysis',
  skillId: SKILL_ID,
  nav: {
    title: 'AI 分析助手',
    tagline: '由 DeepSeek 驱动 · 调用 ux-analysis 技能，把研究数据变成分析结论',
    wordmark: 'ux·analysis',
    intro:
      '上传问卷 / 访谈 / 埋点 / 可用性评估 / 眼动 / 用户声音数据，我会结合你的需求与 ux-analysis 技能自主选择分析方法；只有关键信息确实缺失时才向你确认。',
    landing: {
      heading: 'AI 分析助手 — 数据回来了，把它变成结论',
      description:
        '上传问卷、访谈逐字稿、埋点、可用性测试记录、眼动热区图或用户声音，AI 按研究主题（而不是按数据源）组织分析，多源交叉验证，产出带核心结论与图表的 Word 文档。',
      bullets: [
        '· 支持 xlsx / csv / docx / pdf / txt / 图片',
        '· 资料齐全直接分析，仅在关键缺口时确认',
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
