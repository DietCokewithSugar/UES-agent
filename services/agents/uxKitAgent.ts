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
    tagline: '由 DeepSeek 驱动 · 调用 ux-kit 技能，一句话产出研究材料',
    wordmark: 'ux·kit',
    intro:
      '明确说要问卷 / 访谈提纲 / 可用性测试方案，我先跟你确认需求，然后直接产出那份文档；诉求还比较模糊、或者要好几种材料，我会先出一份研究方案，等你确认后再按阶段生成。',
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
    emptyPlaceholder: '说一句你想做的研究，比如「帮我编一个外卖 App 的满意度问卷」…',
    // ux-kit 是设计研究材料，不需要数据文件
    acceptsFiles: false
  },

  async runControlTurn(ctx: AgentContext): Promise<ControlTurnResult> {
    getUxKitSkill(); // 技能没装好时早点抛错
    const { action, trace } = await runControlTurn(ctx.history, {
      roundsSoFar: ctx.rounds,
      signal: ctx.signal
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
      signal: opts.signal ?? ctx.signal
    });
    return { raw: markdown, format: 'markdown', truncated, trace };
  }
};
