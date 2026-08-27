/**
 * 控制轮返回值的兜底规整。
 *
 * 这里的规则不是"锦上添花"，而是产品硬约束的最后一道闸：
 * **用户明确指定了产出物时就直接产出那份材料、不走研究方案**——
 * 这条不能只靠提示词里的自然语言约束，模型偶尔会在问卷模式下顺手多列一个研究方案。
 * 所以以 mode 为准强制对齐 deliverables，模型说了不算。
 *
 * 拆成独立模块是为了不依赖技能注册表（后者用 import.meta.glob，只能在 Vite 里跑），
 * 这样这段关键逻辑可以直接单测。
 */
import { DELIVERABLE_BY_MODE } from './referencePicker';
import {
  KIND_LABELS,
  type ClarifyOption,
  type ControlAction,
  type Deliverable,
  type IntentSummary,
  type UxKitMode
} from './types';

const CLARIFY_ID_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MODES: UxKitMode[] = ['questionnaire', 'interview', 'usability', 'plan'];

/** 文件名里的主题部分不宜过长，否则下载时文件名难看且可能超出文件系统限制。 */
const MAX_TOPIC_LEN = 30;

/**
 * 规整 ask 选项：截断到 6 个并重派 A–F。
 * 模型偶尔会返回重复或异常的 id，那会同时破坏多选状态与 React key。
 */
export const normalizeAsk = (
  options: ClarifyOption[] | undefined
): ClarifyOption[] =>
  (options || [])
    .map(o => ({
      title: String(o?.title ?? '').trim(),
      description: String(o?.description ?? '').trim()
    }))
    // 先丢掉无效项再派 id，否则中间丢一项会让字母出现断档（A B C E F）
    .filter(o => o.title)
    .slice(0, CLARIFY_ID_LETTERS.length)
    .map((o, i) => ({ id: CLARIFY_ID_LETTERS[i], ...o }));

/**
 * 规整意图：mode 非法时回退到 plan（SKILL.md 的安全兜底），
 * 并强制 deliverables 恰好一项、且 kind 与 mode 对应。
 */
export const normalizeIntent = (intent: IntentSummary): IntentSummary => {
  const mode: UxKitMode = MODES.includes(intent?.mode) ? intent.mode : 'plan';
  const expectedKind = DELIVERABLE_BY_MODE[mode];

  const first = intent?.deliverables?.[0];
  const topic = (intent?.subject || intent?.statement || '用户研究')
    .trim()
    .slice(0, MAX_TOPIC_LEN);

  // 只有当模型给的文件名本来就对得上模式时才沿用，否则按命名规则重新生成
  const keepFilename =
    first?.kind === expectedKind && typeof first.filename === 'string' && first.filename.endsWith('.docx');

  const deliverable: Deliverable = {
    kind: expectedKind,
    filename: keepFilename ? first!.filename : `${topic}${KIND_LABELS[expectedKind]}.docx`,
    summary: first?.summary
  };

  return {
    mode,
    statement: String(intent?.statement ?? '').trim(),
    subject: String(intent?.subject ?? '').trim(),
    audience: String(intent?.audience ?? '').trim(),
    intent: String(intent?.intent ?? '').trim(),
    constraints: (intent?.constraints || []).filter(Boolean),
    methodHints: (intent?.methodHints || []).filter(Boolean),
    uncertain: Boolean(intent?.uncertain),
    deliverables: [deliverable]
  };
};

/** 规整整个控制轮返回；无法识别时返回 null，由调用方转成可重试的错误。 */
export const normalizeControlAction = (raw: ControlAction): ControlAction | null => {
  if (raw?.action === 'ask') {
    const options = normalizeAsk(raw.options);
    if (options.length === 0) return null;
    return { action: 'ask', question: String(raw.question ?? '').trim(), options, note: raw.note };
  }
  if (raw?.action === 'confirm_intent' && raw.intent) {
    return { action: 'confirm_intent', intent: normalizeIntent(raw.intent) };
  }
  return null;
};
