/**
 * 按输出模式与方法信号挑选 ux-kit 的 templates / references。
 *
 * 为什么要挑：`skills/ux-kit/references/` 一共 15 个文件近 4000 行，
 * 这里只按本次交付物与方法信号选择相关资料，不再按字符预算主动裁剪；
 * 可接受的上下文长度由当前 DeepSeek 模型决定。
 *
 * 挑选结果同时是界面上「技能调用轨迹」要展示的内容——UI 上写的必须是真正注入的文件。
 */
import type { SkillMeta } from '../skills/skillRegistry';
import type { DeliverableKind, UxKitMode } from './types';

/** 产出物类型 → 使用的模板文件名。对应 SKILL.md「参考文件索引」一节。 */
const TEMPLATE_BY_KIND: Record<DeliverableKind, string> = {
  questionnaire: 'questionnaire.md',
  interviewGuide: 'interview-guide.md',
  usabilityTest: 'usability-test.md',
  researchPlan: 'research-plan.md'
};

/** 各模式必读的基础参考文件。 */
const BASE_REFS: Record<DeliverableKind, string[]> = {
  questionnaire: ['question-design.md'],
  interviewGuide: ['cba-framework.md', 'probing-techniques.md'],
  usabilityTest: ['usability-test-guide.md'],
  researchPlan: ['research-methods.md', 'sample-size-calculator.md']
};

/**
 * 方法信号 → 参考文件。SKILL.md 规定方法信号一律自动判断，
 * 这张表把判断结果落到具体要读哪个文件上。
 */
const HINT_REFS: { pattern: RegExp; file: string }[] = [
  { pattern: /卡诺|kano/i, file: 'kano-model.md' },
  { pattern: /ets|体验评估|体验诊断|满意度/i, file: 'ets-model.md' },
  { pattern: /jtbd|用户决策|待办任务/i, file: 'jtbd-framework.md' },
  { pattern: /旅程|灵犀|journey/i, file: 'journey-mapping.md' },
  { pattern: /卡片分类|信息架构|card\s*sort/i, file: 'card-sorting.md' },
  { pattern: /眼动|视觉注意|热图|eye\s*track/i, file: 'eye-tracking.md' },
  { pattern: /画像|persona|用户角色/i, file: 'persona.md' }
];

/** 产出自检清单，所有模式都追加，但优先级最低（超预算时先丢它）。 */
const QUALITY_REF = 'quality-checklists.md';

/** 控制轮（Phase 0/1）只需要追问选项模板。 */
export const CONTROL_REFS = ['question-templates.md'];

export interface PickedAssets {
  templates: string[];
  references: string[];
  /** 因预算被丢弃的参考文件，便于在轨迹上如实说明 */
  dropped: string[];
}

/**
 * 挑选一次产出轮要注入的文件。
 *
 * @param skill    ux-kit 技能（用于按实际存在的文件与体积做裁剪）
 * @param kind     本次要产出的材料类型
 * @param hints    自动判断出的方法信号
 */
export const pickAssetsForDeliverable = (
  skill: SkillMeta,
  kind: DeliverableKind,
  hints: string[] = []
): PickedAssets => {
  const template = TEMPLATE_BY_KIND[kind];
  const templates = skill.templates.some(t => t.name === template) ? [template] : [];

  const hintText = hints.join(' ');
  const hintRefs = HINT_REFS.filter(h => h.pattern.test(hintText))
    .map(h => h.file);

  // 优先级：基础参考 → 命中参考 → 质量清单。去重且保序。
  const wanted = [...BASE_REFS[kind], ...hintRefs, QUALITY_REF].filter(
    (f, i, arr) => arr.indexOf(f) === i
  );

  const references: string[] = [];
  const dropped: string[] = [];
  for (const name of wanted) {
    const asset = skill.references.find(r => r.name === name);
    if (!asset) continue; // SKILL.md「异常处理」：参考文件缺失时跳过，不阻断产出
    references.push(name);
  }

  return { templates, references, dropped };
};

/** 从 Kano/ETS 这类信号里挑出问卷模式要用的模型名，供提示词点名。 */
export const describeMethodHints = (hints: string[] = []): string =>
  hints.length ? hints.join('、') : '（无特定方法信号，按通用规则设计）';

/** 模式 → 该模式默认产出的材料类型。 */
export const DELIVERABLE_BY_MODE: Record<UxKitMode, DeliverableKind> = {
  questionnaire: 'questionnaire',
  interview: 'interviewGuide',
  usability: 'usabilityTest',
  plan: 'researchPlan'
};
