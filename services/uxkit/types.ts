/**
 * ux-kit 对话式体验的领域类型。
 *
 * 对应技能 `skills/ux-kit/SKILL.md` 的三个阶段：
 *   Phase 0 输出模式识别 → Phase 1 问题澄清 → Phase 2 按模式产出。
 */

/** Phase 0 的四种输出模式。`plan` 是 SKILL.md 规定的安全兜底默认值。 */
export type UxKitMode = 'questionnaire' | 'interview' | 'usability' | 'plan';

/** 一份产出物的类型。与 SKILL.md 的 2A/2B/2C/2D 一一对应。 */
export type DeliverableKind =
  | 'questionnaire'
  | 'interviewGuide'
  | 'usabilityTest'
  | 'researchPlan';

export interface Deliverable {
  kind: DeliverableKind;
  /** 形如 "外卖App满意度问卷.docx"，由 SKILL.md 的命名规则给出 */
  filename: string;
  /** 该产出物覆盖的内容概述，用于在意图确认卡上让用户提前看到要生成什么 */
  summary?: string;
}

/**
 * Phase 1 收敛出的「研究问题陈述」+ Phase 0 的模式判定。
 * 这就是要跟用户确认的那张「意图确认卡」的数据。
 */
export interface IntentSummary {
  mode: UxKitMode;
  /** 一句话：研究对象 + 目标人群 + 研究意图 */
  statement: string;
  /** 研究对象 */
  subject: string;
  /** 目标人群 */
  audience: string;
  /** 研究意图 */
  intent: string;
  /** 约束条件（时长、样本可及性、有无原型等） */
  constraints?: string[];
  /**
   * 自动判断出的方法信号（Kano / ETS / JTBD / 灵犀旅程 / 卡片分类 / 眼动…）。
   * SKILL.md 规定这些一律自动判断、不追问用户，仅用于挑选参考文件与组织题目。
   */
  methodHints?: string[];
  /** 确认后将要产出的文件。模式非 plan 时长度为 1，即"没有研究方案这一步"。 */
  deliverables: Deliverable[];
  /** 多轮澄清后仍不够清晰时置真，UI 上会明确标注"存在不确定性" */
  uncertain?: boolean;
}

/** 澄清选项。沿用原有 A–F 单字母 id 的约定，便于前端做多选 key。 */
export interface ClarifyOption {
  id: string;
  title: string;
  description: string;
}

/**
 * 控制轮的返回：要么继续追问，要么给出意图确认。
 * 产出动作不由模型决定——模式与产出物已经写在 IntentSummary 里，
 * 用户确认后由编排层按 deliverables 逐个发起产出轮。
 */
export type ControlAction =
  | { action: 'ask'; question: string; options: ClarifyOption[]; note?: string }
  | { action: 'confirm_intent'; intent: IntentSummary };

/** 技能调用轨迹：Claude Code 风格地把"这一步读了技能里的哪些文件"暴露到界面上。 */
export interface SkillTrace {
  skillId: string;
  skillName: string;
  /** 形如 "Phase 1 问题澄清" / "Phase 2A 问卷模式" */
  phase: string;
  /** 实际注入的 templates/ 文件名 */
  templates: string[];
  /** 实际注入的 references/ 文件名 */
  references: string[];
}

/** 一份已生成的产出物。 */
export interface GeneratedDoc {
  id: string;
  kind: DeliverableKind;
  filename: string;
  /** 模型产出的 markdown 原文 */
  markdown: string;
  /** 是否因为触到 max_tokens 而被截断 */
  truncated?: boolean;
}

export const MODE_LABELS: Record<UxKitMode, string> = {
  questionnaire: '问卷模式',
  interview: '提纲模式',
  usability: '可用性模式',
  plan: '方案模式'
};

export const KIND_LABELS: Record<DeliverableKind, string> = {
  questionnaire: '问卷',
  interviewGuide: '访谈提纲',
  usabilityTest: '可用性测试方案',
  researchPlan: '研究方案'
};

/** Phase 2 的阶段名，用于技能调用轨迹的展示。 */
export const MODE_PHASE_LABELS: Record<UxKitMode, string> = {
  questionnaire: 'Phase 2A 问卷模式',
  interview: 'Phase 2B 提纲模式',
  usability: 'Phase 2C 可用性模式',
  plan: 'Phase 2D 方案模式'
};
