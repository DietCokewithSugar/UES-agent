/**
 * 控制轮返回值的兜底规整（多技能共用）。
 *
 * 模型偶尔会漏字段、写错 id、或者返回不合法 JSON。这里统一：
 *   - JSON 解析失败重试一次，把错误回灌给模型；
 *   - ask 选项先过滤空项再派 A–F（先派后过滤会让字母出现断档）；
 *   - 识别不出的动作抛出可重试的错误，而不是把坏数据送进界面。
 */
import { normalizeAsk, normalizeIntent } from '../uxkit/normalize';
import { KIND_LABELS, type Deliverable, type DeliverableKind } from '../uxkit/types';
import type { AgentAction, Proposal } from './types';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * purpose 驱动确定性门禁，所以不能全指望模型填对——标题也参与识别。
 * 先认更具体的分析摘要（洞察/主题结构），再认分析执行方案。
 */
const proposalPurpose = (raw: string, title: string): Proposal['purpose'] => {
  if (raw === 'analysis_plan' || raw === 'insight_review') return raw;
  if (/洞察|主题结构|分析摘要/.test(title)) return 'insight_review';
  if (/分析.*方案|执行方案/.test(title)) return 'analysis_plan';
  return undefined;
};

const normalizeProposal = (raw: unknown): Proposal | null => {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const title = str(p.title);
  if (!title) return null;

  const fields = Array.isArray(p.fields)
    ? p.fields
        .map(f => {
          const o = (f || {}) as Record<string, unknown>;
          return { label: str(o.label), value: str(o.value) };
        })
        .filter(f => f.label && f.value)
    : [];

  const items = Array.isArray(p.items)
    ? p.items
        .map(it => {
          if (typeof it === 'string') return { title: it.trim() };
          const o = (it || {}) as Record<string, unknown>;
          return { title: str(o.title), detail: str(o.detail) || undefined };
        })
        .filter(it => it.title)
    : [];

  return {
    purpose: proposalPurpose(str(p.purpose), title),
    title,
    badge: str(p.badge) || undefined,
    summary: str(p.summary) || undefined,
    fields: fields.length ? fields : undefined,
    items: items.length ? items : undefined,
    note: str(p.note) || undefined,
    confirmLabel: str(p.confirmLabel) || undefined,
    reviseLabel: str(p.reviseLabel) || undefined
  };
};

const KINDS: DeliverableKind[] = [
  'questionnaire',
  'interviewGuide',
  'usabilityTest',
  'researchPlan'
];

const normalizeDeliverables = (raw: unknown, fallbackName: string): Deliverable[] => {
  const list = Array.isArray(raw) ? raw : [];
  const out: Deliverable[] = [];
  for (const d of list) {
    const o = (d || {}) as Record<string, unknown>;
    const kind = (KINDS.includes(o.kind as DeliverableKind) ? o.kind : 'researchPlan') as DeliverableKind;
    const filename = str(o.filename);
    out.push({
      kind,
      filename: filename.endsWith('.docx') ? filename : `${fallbackName}${KIND_LABELS[kind]}.docx`,
      summary: str(o.summary) || undefined
    });
  }
  return out;
};

/** 把原始返回规整成 AgentAction；识别不了返回 null。 */
export const normalizeAction = (
  raw: unknown,
  opts: { fallbackName?: string } = {}
): AgentAction | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const fallbackName = opts.fallbackName ?? '用户研究';

  switch (str(r.action)) {
    case 'ask': {
      const options = normalizeAsk(r.options as any);
      if (!options.length) return null;
      return {
        action: 'ask',
        question: str(r.question),
        options,
        multiple: r.multiple !== false,
        note: str(r.note) || undefined
      };
    }

    case 'intent':
    case 'confirm_intent':
      return r.intent ? { action: 'intent', intent: normalizeIntent(r.intent as any) } : null;

    case 'propose': {
      const proposal = normalizeProposal(r.proposal);
      return proposal ? { action: 'propose', proposal } : null;
    }

    case 'request_files': {
      const prompt = str(r.prompt);
      return prompt
        ? { action: 'request_files', prompt, hint: str(r.hint) || undefined }
        : null;
    }

    case 'generate': {
      const deliverables = normalizeDeliverables(r.deliverables, fallbackName);
      return deliverables.length ? { action: 'generate', deliverables } : null;
    }

    case 'done': {
      const text = str(r.text);
      return text ? { action: 'done', text } : null;
    }

    default:
      return null;
  }
};

/**
 * 跑一次控制轮调用并规整结果，JSON 坏掉时重试一次。
 * @param call 发起一次 deepseekJson 调用；`retryHint` 非空时应把它追加进消息
 */
export const normalizeAgentAction = async (
  call: (retryHint?: string) => Promise<unknown>,
  opts: { fallbackName?: string } = {}
): Promise<AgentAction> => {
  let raw: unknown;
  try {
    raw = await call();
  } catch (err) {
    raw = await call(
      `上一次返回无法解析为 JSON——${(err as Error).message.slice(
        0,
        200
      )}。请只输出一个合法 JSON 对象，不要任何围栏或解释。`
    );
  }

  const action = normalizeAction(raw, opts);
  if (action) return action;
  throw new Error('AI 返回的控制指令无法识别，请重试。');
};
