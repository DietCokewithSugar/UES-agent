/**
 * 对话消息模型，以及"聊天记录 → DeepSeek messages"的摊平。
 *
 * 旧的五步向导没有任何多轮记忆——它把历史压成 `clarifications[]` 字符串再塞进
 * 一次性的 prompt 里。这里换成真正的 user/assistant 交替，模型能看到完整的追问上下文。
 */
import type { Attachment } from '../../utils/attachments';
import type { DocFormat, HandoffContext, Proposal } from '../agents/types';
import type { DeepSeekMessage } from '../deepseekService';
import type {
  ClarifyOption,
  Deliverable,
  GeneratedDoc,
  IntentSummary,
  SkillTrace
} from './types';

export interface ClarifyAnswer {
  selected: ClarifyOption[];
  custom: string;
  skipped: boolean;
}

export type ChatMessage =
  | { id: string; role: 'user'; kind: 'text'; text: string; attachments?: Attachment[] }
  | { id: string; role: 'user'; kind: 'handoff'; handoff: HandoffContext }
  | { id: string; role: 'user'; kind: 'answer'; answer: ClarifyAnswer }
  | { id: string; role: 'assistant'; kind: 'text'; text: string }
  | {
      id: string;
      role: 'assistant';
      kind: 'clarify';
      question: string;
      options: ClarifyOption[];
      /** false 时渲染成单选 */
      multiple: boolean;
      note?: string;
      answer?: ClarifyAnswer;
    }
  | {
      id: string;
      role: 'assistant';
      kind: 'proposal';
      proposal: Proposal;
      status: 'pending' | 'confirmed' | 'superseded';
    }
  | {
      id: string;
      role: 'assistant';
      kind: 'request_files';
      prompt: string;
      hint?: string;
      satisfied?: boolean;
    }
  | {
      id: string;
      role: 'assistant';
      kind: 'intent';
      intent: IntentSummary;
      status: 'pending' | 'confirmed' | 'superseded';
    }
  | {
      id: string;
      role: 'assistant';
      kind: 'document';
      doc: GeneratedDoc;
      format: DocFormat;
      streaming?: boolean;
      awaitingConfirm?: boolean;
      /** ux-kit 产出材料后，引导去 ux-analysis 做分析 */
      offerAnalysis?: boolean;
    }
  | { id: string; role: 'assistant'; kind: 'trace'; trace: SkillTrace; running?: boolean }
  | { id: string; role: 'assistant'; kind: 'error'; message: string };

let seq = 0;
export const nextId = (prefix: string): string => {
  seq += 1;
  return `${prefix}-${seq}`;
};

/** 把一次多选作答描述成自然语言，喂回给模型。 */
export const describeAnswer = (answer: ClarifyAnswer): string => {
  if (answer.skipped) return '（跳过这一问，请沿用你当前的理解继续。）';
  const parts: string[] = [];
  if (answer.selected.length > 0) {
    parts.push(
      `我选了 ${answer.selected.length} 个方向：` +
        answer.selected.map(s => `【${s.title}】${s.description}`).join('；')
    );
  }
  if (answer.custom) parts.push(`补充：${answer.custom}`);
  return parts.join('\n') || '（未选择，也没有补充。）';
};

/**
 * 聊天记录 → 控制轮要发给 DeepSeek 的 messages。
 *
 * 产出的文档正文**不进历史**——一份研究方案好几千字，带上去既没必要也会挤爆上下文；
 * 只留一行说明让模型知道那份材料已经生成过了。
 */
export const toDeepSeekMessages = (messages: ChatMessage[]): DeepSeekMessage[] => {
  const out: DeepSeekMessage[] = [];
  for (const m of messages) {
    switch (m.kind) {
      case 'text': {
        const files = m.role === 'user' ? m.attachments : undefined;
        out.push({
          role: m.role,
          content: files?.length
            ? `${m.text}\n（本条消息附带 ${files.length} 个文件：${files
                .map(a => a.name)
                .join('、')}）`
            : m.text
        });
        break;
      }
      case 'handoff':
        out.push({
          role: 'user',
          content: [
            '以下是从 AI 研究助手带入并已由用户确认的需求摘要。请直接作为当前研究背景使用，不要索要研究方案全文，也不要重复追问已经明确的字段。',
            `研究需求：${m.handoff.statement}`,
            m.handoff.subject ? `研究对象：${m.handoff.subject}` : '',
            m.handoff.audience ? `目标人群：${m.handoff.audience}` : '',
            m.handoff.intent ? `研究目的：${m.handoff.intent}` : '',
            m.handoff.constraints?.length
              ? `约束条件：${m.handoff.constraints.join('；')}`
              : ''
          ]
            .filter(Boolean)
            .join('\n')
        });
        break;
      case 'answer':
        out.push({ role: 'user', content: describeAnswer(m.answer) });
        break;
      case 'clarify':
        out.push({
          role: 'assistant',
          content: JSON.stringify({
            action: 'ask',
            question: m.question,
            options: m.options
          })
        });
        break;
      case 'intent':
        out.push({
          role: 'assistant',
          content: JSON.stringify({ action: 'confirm_intent', intent: m.intent })
        });
        if (m.status === 'confirmed') {
          out.push({ role: 'user', content: '确认，按此理解开始生成。' });
        } else if (m.status === 'superseded') {
          out.push({ role: 'user', content: '以上理解需要修改，请结合我接下来的补充重新判断。' });
        }
        break;
      case 'proposal':
        out.push({
          role: 'assistant',
          content: JSON.stringify({ action: 'propose', proposal: m.proposal })
        });
        if (m.status === 'confirmed') {
          out.push({ role: 'user', content: '确认，继续下一步。' });
        } else if (m.status === 'superseded') {
          out.push({ role: 'user', content: '以上提案需要修改，请结合我接下来的补充更新判断。' });
        }
        break;

      case 'request_files':
        out.push({
          role: 'assistant',
          content: JSON.stringify({ action: 'request_files', prompt: m.prompt })
        });
        break;

      case 'document':
        out.push({
          role: 'assistant',
          content: `（已生成《${m.doc.filename}》）\n\n${m.doc.markdown}`
        });
        break;
      // trace / error 是界面状态，不进模型上下文
      default:
        break;
    }
  }
  return out;
};

/** 已经追问过几轮，用来卡住澄清上限。 */
export const countClarifyRounds = (messages: ChatMessage[]): number =>
  messages.filter(m => m.kind === 'clarify' || m.kind === 'proposal').length;

/** 本会话已上传的全部附件（去重按 id）。 */
export const collectAttachments = (messages: ChatMessage[]): Attachment[] => {
  const seen = new Set<string>();
  const out: Attachment[] = [];
  for (const m of messages) {
    if (m.kind !== 'text' || m.role !== 'user' || !m.attachments) continue;
    for (const a of m.attachments) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
  }
  return out;
};

export const isPlanDeliverable = (d: Deliverable): boolean => d.kind === 'researchPlan';
