/**
 * ux-kit agent —— 把已有的 uxkitOrchestrator 适配到多技能框架。
 *
 * 流程逻辑（Phase 0 输出模式识别 / Phase 1 澄清 / Phase 2 按模式产出）仍在
 * `services/uxkit/uxkitOrchestrator.ts` 里，这里只做形状转换，
 * 让它和 ux-analysis 共用同一个聊天外壳。
 */
import { getUxKitSkill, runControlTurn, runGenerateTurn } from '../uxkit/uxkitOrchestrator';
import type { Deliverable } from '../uxkit/types';
import type {
  AgentContext,
  AgentDefinition,
  ControlTurnResult,
  GenerateOptions,
  GenerateTurnResult
} from './types';

export const uxKitAgent: AgentDefinition = {
  id: 'ux-kit',
  skillId: 'ux-kit',
  nav: {
    title: 'AI 研究助手',
    chatHeading: '你的用户研究，一句话启动',
    tagline: '由 DeepSeek 驱动 · 调用 ux-kit 技能，一句话产出研究材料',
    wordmark: 'AI用户研究助手',
    intro:
      '用户研究全流程智能助手，覆盖需求澄清-方案设计-研究材料全链路，内置10种专业方法论（问卷调查、深度访谈、可用性评估、灵犀旅程、ETS体验评估等），帮你一键搞定研究执行前的准备工作',
    landing: {
      heading: 'AI 研究助手 — 一句话产出用户研究材料',
      description:
        '对话式地调用 ux-kit 研究技能：你说一句诉求，AI 用可多选的问题跟你校准方向，归纳出研究问题陈述请你确认，确认后直接产出 Word 文档。',
      bullets: [
        '· 多选题式追问，避免"理解偏差"',
        '· 明确说要问卷/提纲，就直接出材料',
        '· 诉求模糊时先出研究方案再出材料',
        '· 产出 .docx，全文微软雅黑排版'
      ],
      cta: '进入 AI 研究助手'
    }
  },
  composer: {
    placeholder: '继续补充或提出修改…',
    emptyPlaceholder:
      '告诉我你想做什么：我想调研一下用户对XX产品有什么需求/我想做一个关于XX的研究/帮我编制一份调查问卷...',
    // ux-kit 是设计研究材料，不需要数据文件
    acceptsFiles: false
  },

  async runControlTurn(ctx: AgentContext): Promise<ControlTurnResult> {
    getUxKitSkill(); // 技能没装好时早点抛错
    const { action, trace } = await runControlTurn(ctx.history, {
      roundsSoFar: ctx.rounds,
      signal: ctx.signal,
      onTrace: ctx.onTrace
    });
    return {
      trace,
      action:
        action.action === 'ask'
          ? { action: 'ask', question: action.question, options: action.options, multiple: true, note: action.note }
          : { action: 'intent', intent: action.intent }
    };
  },

  async runGenerateTurn(
    ctx: AgentContext,
    deliverable: Deliverable,
    opts: GenerateOptions = {}
  ): Promise<GenerateTurnResult> {
    if (!ctx.intent) throw new Error('缺少已确认的研究需求，无法生成材料。');
    const { markdown, truncated, trace } = await runGenerateTurn(ctx.intent, deliverable, {
      onDelta: opts.onDelta,
      planMarkdown: ctx.planMarkdown,
      feedback: opts.feedback,
      signal: opts.signal ?? ctx.signal,
      onTrace: opts.onTrace
    });
    return { raw: markdown, format: 'markdown', truncated, trace };
  }
};
