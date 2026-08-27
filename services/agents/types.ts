/**
 * 多技能对话框架的共用类型。
 *
 * 两个技能（ux-kit 研究材料设计、ux-analysis 数据分析）共用同一套聊天外壳，
 * 差异收敛到一个 `AgentDefinition` 里：注入什么技能、控制轮怎么问、产出轮出什么。
 *
 * 关键设计：**流程本身写在 SKILL.md 里，不写在 TS 里**。
 * 代码只提供动作词汇表（问 / 提案 / 要文件 / 产出 / 收尾）与轨道，
 * 具体走到哪一步、问什么，由注入的技能文档驱动——这样技能改了流程，代码不用动。
 */
import type { DeepSeekMessage } from '../deepseekService';
import type { Attachment } from '../../utils/attachments';
import type {
  ClarifyOption,
  Deliverable,
  IntentSummary,
  SkillTrace
} from '../uxkit/types';

export type AgentId = 'ux-kit' | 'ux-analysis';

/** 产出物的格式，决定用哪个解析器与哪套排版主题。 */
export type DocFormat = 'markdown' | 'analysisJson';

export interface ProposalField {
  label: string;
  value: string;
}

export interface ProposalItem {
  title: string;
  detail?: string;
}

/**
 * 通用提案卡的数据。
 *
 * ux-analysis 的多个确认节点（研究类型确认、数据清单确认、分析方案确认、
 * 主题结构审查）形状一致，都用这一张卡，不为每个节点写一个组件。
 */
export interface Proposal {
  /** 卡片标题，如「研究背景与研究类型」 */
  title: string;
  /** 徽章，如「Step 1」 */
  badge?: string;
  /** 顶部大字概述 */
  summary?: string;
  fields?: ProposalField[];
  items?: ProposalItem[];
  note?: string;
  confirmLabel?: string;
  reviseLabel?: string;
}

/** 从上游研究助手带入分析助手的精简需求记忆。 */
export interface HandoffContext {
  source: 'ux-kit';
  statement: string;
  subject?: string;
  audience?: string;
  intent?: string;
  constraints?: string[];
}

/**
 * 控制轮的返回。
 * `intent` 是 ux-kit 专用（研究问题陈述卡），`propose` 是通用提案卡。
 */
export type AgentAction =
  | {
      action: 'ask';
      question: string;
      options: ClarifyOption[];
      /** false 时前端渲染成单选 */
      multiple: boolean;
      note?: string;
    }
  | { action: 'intent'; intent: IntentSummary }
  | { action: 'propose'; proposal: Proposal }
  | { action: 'request_files'; prompt: string; hint?: string }
  | { action: 'generate'; deliverables: Deliverable[] }
  | { action: 'done'; text: string };

export interface AgentContext {
  /** 已摊平的多轮对话——只含当前会话，保证窗口间上下文独立 */
  history: DeepSeekMessage[];
  /** 本会话已上传的附件 */
  attachments: Attachment[];
  /** 已经追问过几轮 */
  rounds: number;
  /** 已确认的意图（ux-kit）*/
  intent?: IntentSummary;
  /** 已确认的研究方案正文（ux-kit 方案模式）*/
  planMarkdown?: string;
  /** 从消息历史确定性推导的已完成状态，防止模型重复发同类确认卡。 */
  milestones: {
    hasHandoff: boolean;
    confirmedIntent: boolean;
    confirmedProposals: string[];
  };
  signal?: AbortSignal;
}

export interface ControlTurnResult {
  action: AgentAction;
  trace: SkillTrace;
}

export interface GenerateTurnResult {
  /** 产出的原文：markdown 或 analysis.json 字符串 */
  raw: string;
  format: DocFormat;
  truncated: boolean;
  trace: SkillTrace;
}

export interface GenerateOptions {
  onDelta?: (chunk: string) => void;
  feedback?: string;
  signal?: AbortSignal;
}

/** 首页入口与空态的展示信息。 */
export interface AgentNav {
  title: string;
  /** 对话空态主标题，缺省沿用 title。 */
  chatHeading?: string;
  tagline: string;
  /** 空态的极淡字标 */
  wordmark: string;
  intro: string;
  /** 首页卡片文案 */
  landing: {
    heading: string;
    description: string;
    bullets: string[];
    cta: string;
  };
}

export interface AgentDefinition {
  id: AgentId;
  /** 对应 skills/ 下的目录名 */
  skillId: string;
  nav: AgentNav;
  composer: {
    placeholder: string;
    emptyPlaceholder: string;
    acceptsFiles: boolean;
    /** input accept 属性 */
    accept?: string;
  };
  runControlTurn(ctx: AgentContext): Promise<ControlTurnResult>;
  runGenerateTurn(
    ctx: AgentContext,
    deliverable: Deliverable,
    opts?: GenerateOptions
  ): Promise<GenerateTurnResult>;
}

export type { Attachment, ClarifyOption, Deliverable, IntentSummary, SkillTrace };
