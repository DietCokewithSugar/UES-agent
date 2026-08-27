/**
 * 对话消息模型，以及"聊天记录 → DeepSeek messages"的摊平。
 *
 * 旧的五步向导没有任何多轮记忆——它把历史压成 `clarifications[]` 字符串再塞进
 * 一次性的 prompt 里。这里换成真正的 user/assistant 交替，模型能看到完整的追问上下文。
 */
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
  | { id: string; role: 'user'; kind: 'text'; text: string }
  | { id: string; role: 'user'; kind: 'answer'; answer: ClarifyAnswer }
  | { id: string; role: 'assistant'; kind: 'text'; text: string }
  | {
      id: string;
      role: 'assistant';
      kind: 'clarify';
      question: string;
      options: ClarifyOption[];
      note?: string;
      answer?: ClarifyAnswer;
    }
  | {
      id: string;
      role: 'assistant';
      kind: 'intent';
      intent: IntentSummary;
      status: 'pending' | 'confirmed';
    }
  | {
      id: string;
      role: 'assistant';
      kind: 'document';
      doc: GeneratedDoc;
      streaming?: boolean;
      awaitingConfirm?: boolean;
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
      case 'text':
        out.push({ role: m.role, content: m.text });
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
        break;
      case 'document':
        out.push({
          role: 'assistant',
          content: `（已生成《${m.doc.filename}》，正文从略。）`
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
  messages.filter(m => m.kind === 'clarify').length;

export const isPlanDeliverable = (d: Deliverable): boolean => d.kind === 'researchPlan';
