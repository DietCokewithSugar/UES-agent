/**
 * 技能注册表（Skill Registry）—— 通用的「技能调用工具」
 *
 * 本模块在构建期通过 Vite 的 import.meta.glob 把 /skills 目录下所有遵循
 * Anthropic Agent Skills 约定（每个技能一个文件夹，含 SKILL.md 前置元数据 +
 * 可选 references/）的技能打包进前端，供 "AI 体验伙伴" 在运行时调用：
 *
 *   - 流程二「选择研究方法」：使用各技能的 name + description 构建技能目录，
 *     告诉 AI 当前系统装了哪些研究方法、分别适合什么时候用（见 listSkills / buildSkillCatalog）。
 *   - 流程三「设计研究方法」：根据已选方法解析出对应技能，把该技能完整的
 *     SKILL.md 正文 + references 注入提示词，驱动具体设计（见 findSkillForMethod / buildSkillKnowledge）。
 *
 * 新增研究方法时，只需在 /skills 下新建一个技能文件夹（SKILL.md 带 name/description，
 * 可选 role / methodCategories / keywords / references），无需改动任何代码。
 *
 * 技能分两类角色（前置元数据 role，缺省 method）：
 *   - method  技能进入上述目录与方法路由（如 questionnaire-generator、interview-guide-generator）；
 *   - process 技能服务于特定流程阶段，由 deepseekService 按 id 显式注入
 *     （problem-clarifier → 流程「研究问题」；research-plan-generator → 流程「研究方案」）。
 */
import yaml from 'js-yaml';

export interface SkillReference {
  /** 引用文件名，例如 "kano-model.md" */
  name: string;
  /** 引用文件原文 */
  content: string;
}

/**
 * 技能角色：
 *   - method  —— 研究方法技能（问卷、访谈等），进入流程二的技能目录，
 *                并可被 findSkillForMethod 按方法路由（流程三注入）。
 *   - process —— 流程技能（问题澄清、方案生成方法论等），不作为研究方法出现，
 *                由对应阶段通过 getSkill(id) 显式注入提示词。
 * 前置元数据缺省时视为 method（向后兼容）。
 */
export type SkillRole = 'method' | 'process';

export interface SkillMeta {
  /** 技能文件夹名，作为稳定 id，例如 "questionnaire-generator" */
  id: string;
  /** 前置元数据中的 name，缺省回退到 id */
  name: string;
  /** 前置元数据中的 description（技能的"是什么 / 何时用"） */
  description: string;
  /** 技能角色，见 SkillRole */
  role: SkillRole;
  /** 该技能服务的研究方法分类（与 ResearchMethodCategory 对齐），用于精确路由 */
  methodCategories: string[];
  /** 触发关键词，用于在方法名中做模糊匹配 */
  keywords: string[];
  /** SKILL.md 去除前置元数据后的正文 */
  body: string;
  /** references/ 下的所有参考文件 */
  references: SkillReference[];
}

interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** 拆分 YAML 前置元数据与正文。无前置元数据时整体作为 body。 */
const parseFrontmatter = (raw: string): Frontmatter => {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) return { data: {}, body: raw };
  let data: Record<string, unknown> = {};
  try {
    data = (yaml.load(match[1]) as Record<string, unknown>) || {};
  } catch {
    data = {};
  }
  return { data, body: match[2] };
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,，、]/)
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
};

// 构建期把技能文件作为原始文本打包进来。键为相对项目根的绝对路径。
const skillFiles = import.meta.glob('/skills/*/SKILL.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

const referenceFiles = import.meta.glob('/skills/*/references/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

/** 从 "/skills/<id>/SKILL.md" 解析出技能 id。 */
const skillIdFromSkillPath = (path: string): string | null => {
  const m = /\/skills\/([^/]+)\/SKILL\.md$/.exec(path);
  return m ? m[1] : null;
};

/** 从 "/skills/<id>/references/<file>" 解析出 [id, 文件名]。 */
const refInfoFromPath = (path: string): { id: string; file: string } | null => {
  const m = /\/skills\/([^/]+)\/references\/([^/]+)$/.exec(path);
  return m ? { id: m[1], file: m[2] } : null;
};

const buildRegistry = (): SkillMeta[] => {
  // 先按技能 id 归集 references
  const refsById = new Map<string, SkillReference[]>();
  for (const [path, content] of Object.entries(referenceFiles)) {
    const info = refInfoFromPath(path);
    if (!info) continue;
    const list = refsById.get(info.id) || [];
    list.push({ name: info.file, content });
    refsById.set(info.id, list);
  }

  const skills: SkillMeta[] = [];
  for (const [path, raw] of Object.entries(skillFiles)) {
    const id = skillIdFromSkillPath(path);
    if (!id) continue;
    const { data, body } = parseFrontmatter(raw);
    const references = (refsById.get(id) || []).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    skills.push({
      id,
      name: (typeof data.name === 'string' && data.name.trim()) || id,
      description:
        typeof data.description === 'string' ? data.description.trim() : '',
      role: data.role === 'process' ? 'process' : 'method',
      methodCategories: toStringArray(data.methodCategories),
      keywords: toStringArray(data.keywords),
      body: body.trim(),
      references
    });
  }
  // 稳定排序，便于目录展示
  return skills.sort((a, b) => a.id.localeCompare(b.id));
};

let registryCache: SkillMeta[] | null = null;

/** 返回所有已安装技能。结果在首次调用后缓存。 */
export const listSkills = (): SkillMeta[] => {
  if (!registryCache) registryCache = buildRegistry();
  return registryCache;
};

/** 按 id 精确获取一个技能。 */
export const getSkill = (id: string): SkillMeta | undefined =>
  listSkills().find(s => s.id === id);

/** 仅返回研究方法技能（role=method），流程技能不参与方法目录与方法路由。 */
export const listMethodSkills = (): SkillMeta[] =>
  listSkills().filter(s => s.role === 'method');

/**
 * 把一个研究方法（分类 + 方法名）解析为对应技能：
 *   1. methodCategory 命中技能声明的 methodCategories；
 *   2. 否则在「方法名 + 分类」文本中模糊匹配技能 keywords / name / id。
 * 找不到则返回 undefined（此时调用方应退回到无技能的默认行为）。
 */
export const findSkillForMethod = (
  methodCategory?: string,
  method?: string
): SkillMeta | undefined => {
  const skills = listMethodSkills();
  const cat = (methodCategory || '').trim().toLowerCase();

  if (cat) {
    const byCategory = skills.find(s =>
      s.methodCategories.some(c => c.toLowerCase() === cat)
    );
    if (byCategory) return byCategory;
  }

  const haystack = `${method || ''} ${methodCategory || ''}`.toLowerCase();
  if (!haystack.trim()) return undefined;

  return skills.find(s => {
    const needles = [...s.keywords, s.name, s.id]
      .map(n => n.toLowerCase())
      .filter(Boolean);
    return needles.some(n => haystack.includes(n));
  });
};

/**
 * 流程二用：构建「技能目录」文本，列出每个已安装技能的名称与适用场景，
 * 供研究方案推荐阶段告诉 AI 当前系统具备哪些研究方法、何时使用。
 */
export const buildSkillCatalog = (): string => {
  const skills = listMethodSkills();
  if (skills.length === 0) return '';
  return skills
    .map(s => {
      const desc = s.description.replace(/\s+/g, ' ').trim();
      return `- 【${s.name}】${desc}`;
    })
    .join('\n');
};

/**
 * 把某个技能的正文与参考文件拼成知识块，注入提示词。
 * 这样设计阶段会严格遵循该技能的方法论；技能内部对 references 的引用即"相互调用"。
 *
 * opts.refs 控制注入哪些参考文件：
 *   - 'all'（默认）—— 正文 + 全部 references（流程四执行指南的现有行为）；
 *   - 'none'        —— 仅正文（流程三第一段：方法匹配，不需要各方法细节）；
 *   - string[]      —— 仅注入指定文件名的 references（流程三第二段：按命中方法细化）。
 */
export const buildSkillKnowledge = (
  skill: SkillMeta,
  opts: { refs?: 'all' | 'none' | string[] } = {}
): string => {
  const refsOpt = opts.refs ?? 'all';
  const parts: string[] = [];
  parts.push(`# 技能：${skill.name}（${skill.id}）`);
  if (skill.description) parts.push(`技能说明：${skill.description.trim()}`);
  parts.push(`\n## SKILL.md 正文\n${skill.body}`);
  const refs =
    refsOpt === 'all'
      ? skill.references
      : refsOpt === 'none'
      ? []
      : skill.references.filter(r => refsOpt.includes(r.name));
  for (const ref of refs) {
    parts.push(`\n## 参考文件：references/${ref.name}\n${ref.content.trim()}`);
  }
  return parts.join('\n');
};
