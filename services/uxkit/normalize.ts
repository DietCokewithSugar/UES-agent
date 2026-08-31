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
 * 兜底选项：界面本身就有「跳过这一问」按钮和自定义补充输入框，模型再给一个
 * 「还不确定 / 跳过此问题 / 其他（请描述）」就是重复。更糟的是用户一旦选它，
 * 这一轮等于没作答，模型下一轮很容易把同一个问题原样再问一遍。
 *
 * 整条锚定匹配，避免误伤"其他理财产品用户"这类正常选项。
 */
const FALLBACK_OPTION_RE =
  /^(跳过[^，。]*|其他([（(][^）)]*[）)])?|(我|还)?不(确定|清楚|知道)|没想好|都可以|都行|无所谓)$/;

/**
 * 规整 ask 选项：剔掉兜底项、截断到 6 个并重派 A–F。
 * 模型偶尔会返回重复或异常的 id，那会同时破坏多选状态与 React key。
 */
export const normalizeAsk = (
  options: ClarifyOption[] | undefined
): ClarifyOption[] => {
  const cleaned = (options || [])
    .map(o => ({
      title: String(o?.title ?? '').trim(),
      description: String(o?.description ?? '').trim()
    }))
    // 先丢掉无效项再派 id，否则中间丢一项会让字母出现断档（A B C E F）
    .filter(o => o.title);
  const real = cleaned.filter(o => !FALLBACK_OPTION_RE.test(o.title));
  // 剔完不足 2 个真实方向时保留原样——退化的返回值不该把整张卡片打空
  return (real.length >= 2 ? real : cleaned)
    .slice(0, CLARIFY_ID_LETTERS.length)
    .map((o, i) => ({ id: CLARIFY_ID_LETTERS[i], ...o }));
};

/** 归一化问题文本：去掉空白与标点，只比较实质内容。 */
const questionKey = (q: string): string =>
  String(q ?? '')
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .toLowerCase();

/**
 * 这个问题是不是已经问过了。
 *
 * 用户答「还不确定」之后，模型会把同一段问题连同同一批选项原样再抛一次，
 * 界面上看就是"卡住了"。提示词里的"同一个问题只问一次"挡不住，所以这里判死。
 */
export const isRepeatedQuestion = (question: string, asked: string[]): boolean => {
  const key = questionKey(question);
  if (key.length < 4) return false;
  return asked.some(prev => {
    const p = questionKey(prev);
    if (!p) return false;
    if (p === key) return true;
    // 只加了几个字的改写也算重复；长度门槛避免把"目标人群是谁"这类短问题误判
    const [short, long] = p.length <= key.length ? [p, key] : [key, p];
    return short.length >= 10 && long.includes(short);
  });
};

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
