/**
 * 技能注册表（Skill Registry）—— 通用的「技能调用工具」
 *
 * 本模块在构建期通过 Vite 的 import.meta.glob 把 /skills 目录下所有遵循
 * Anthropic Agent Skills 约定（每个技能一个文件夹，含 SKILL.md 前置元数据 +
 * 可选 references/ 与 templates/）的技能打包进前端，供对话式的 ux-kit 体验在运行时调用。
 *
 * 注入正文时会剥离技能文档中的「与上下游技能协作」章节，避免技能仓库层面的
 * 流程分工说明诱导模型跨技能引用方法论。
 *
 * 新增技能时，只需在 /skills 下新建一个技能文件夹（SKILL.md 带 name/description，
 * 可选 role / methodCategories / keywords / references / templates），无需改动本文件。
 *
 * 注意：`scripts/` 与 `evals/` 不打包进前端——脚本在浏览器里跑不了，
 * 它们留在仓库中作为规格与评测用例（例如 ux-kit 的 convert_to_docx.py 是
 * services/docx/blocksToDocx.ts 的移植来源）。
 */
import yaml from 'js-yaml';

export interface SkillReference {
  /** 文件名，例如 "kano-model.md" / "questionnaire.md" */
  name: string;
  /** 文件原文 */
  content: string;
}

/**
 * 技能角色：
 *   - process —— 流程技能，自身驱动一整条流程（如 ux-kit 的 Phase 0/1/2）。
 *   - method  —— 研究方法技能，服务某种具体研究方法。
 * 前置元数据缺省时视为 method（向后兼容）。
 */
export type SkillRole = 'method' | 'process';

export interface SkillMeta {
  /** 技能文件夹名，作为稳定 id，例如 "ux-kit" */
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
  /** templates/ 下的所有产出模板 */
  templates: SkillReference[];
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

const templateFiles = import.meta.glob('/skills/*/templates/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

/** 从 "/skills/<id>/SKILL.md" 解析出技能 id。 */
const skillIdFromSkillPath = (path: string): string | null => {
  const m = /\/skills\/([^/]+)\/SKILL\.md$/.exec(path);
  return m ? m[1] : null;
};

/** 从 "/skills/<id>/<dir>/<file>" 解析出 [id, 文件名]。 */
const assetInfoFromPath = (
  path: string,
  dir: 'references' | 'templates'
): { id: string; file: string } | null => {
  const m = new RegExp(`/skills/([^/]+)/${dir}/([^/]+)$`).exec(path);
  return m ? { id: m[1], file: m[2] } : null;
};

/** 把一组 glob 结果按技能 id 归集成 SkillReference[]。 */
const groupById = (
  files: Record<string, string>,
  dir: 'references' | 'templates'
): Map<string, SkillReference[]> => {
  const byId = new Map<string, SkillReference[]>();
  for (const [path, content] of Object.entries(files)) {
    const info = assetInfoFromPath(path, dir);
    if (!info) continue;
    const list = byId.get(info.id) || [];
    list.push({ name: info.file, content });
    byId.set(info.id, list);
  }
  return byId;
};

const byName = (a: SkillReference, b: SkillReference) => a.name.localeCompare(b.name);

const buildRegistry = (): SkillMeta[] => {
  // 先按技能 id 归集 references 与 templates
  const refsById = groupById(referenceFiles, 'references');
  const tplsById = groupById(templateFiles, 'templates');

  const skills: SkillMeta[] = [];
  for (const [path, raw] of Object.entries(skillFiles)) {
    const id = skillIdFromSkillPath(path);
    if (!id) continue;
    const { data, body } = parseFrontmatter(raw);
    const references = (refsById.get(id) || []).sort(byName);
    const templates = (tplsById.get(id) || []).sort(byName);
    skills.push({
      id,
      name: (typeof data.name === 'string' && data.name.trim()) || id,
      description:
        typeof data.description === 'string' ? data.description.trim() : '',
      role: data.role === 'process' ? 'process' : 'method',
      methodCategories: toStringArray(data.methodCategories),
      keywords: toStringArray(data.keywords),
      body: body.trim(),
      references,
      templates
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

/**
 * 注入前剥离技能正文中的「与上下游技能协作」类章节：
 * 这些章节只是技能仓库层面的流程分工说明，注入后会诱导模型跨阶段引用
 * 其他技能的方法论，造成阶段间串扰。skills/ 下的源文件保持原样，仅影响注入内容。
 */
const stripCollaborationSections = (body: string): string => {
  const lines = body.split('\n');
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      skipping = /^##\s*与.*技能.*协作/.test(line);
    }
    if (!skipping) out.push(line);
  }
  return out.join('\n');
};

/**
 * 把某个技能的正文、产出模板与参考文件拼成知识块，注入提示词。
 * 技能内部对 references / templates 的引用即"相互调用"（仅限技能自身目录内）。
 *
 * opts.refs / opts.templates 控制注入哪些文件，语义一致：
 *   - 'all'    —— 全部注入；
 *   - 'none'   —— 一个都不注入（默认，控制轮只需要正文）；
 *   - string[] —— 只注入指定文件名的那几个（产出轮按模式挑选）。
 *
 * ux-kit 的 references 加起来有几万字，全量注入会撑爆上下文，
 * 所以调用方必须显式挑选——见 services/uxkit/referencePicker.ts。
 */
export const buildSkillKnowledge = (
  skill: SkillMeta,
  opts: {
    refs?: 'all' | 'none' | string[];
    templates?: 'all' | 'none' | string[];
  } = {}
): string => {
  const parts: string[] = [];
  parts.push(`# 技能：${skill.name}（${skill.id}）`);
  if (skill.description) parts.push(`技能说明：${skill.description.trim()}`);
  parts.push(`\n## SKILL.md 正文\n${stripCollaborationSections(skill.body)}`);

  for (const tpl of pickAssets(skill.templates, opts.templates ?? 'none')) {
    parts.push(`\n## 产出模板：templates/${tpl.name}\n${tpl.content.trim()}`);
  }
  for (const ref of pickAssets(skill.references, opts.refs ?? 'none')) {
    parts.push(`\n## 参考文件：references/${ref.name}\n${ref.content.trim()}`);
  }
  return parts.join('\n');
};

/** 按 'all' | 'none' | 文件名白名单过滤。白名单保持传入顺序，便于调用方控制优先级。 */
const pickAssets = (
  assets: SkillReference[],
  opt: 'all' | 'none' | string[]
): SkillReference[] => {
  if (opt === 'all') return assets;
  if (opt === 'none') return [];
  return opt
    .map(name => assets.find(a => a.name === name))
    .filter((a): a is SkillReference => Boolean(a));
};
