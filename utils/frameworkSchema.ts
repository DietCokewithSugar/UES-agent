import { EvaluationFramework, EvaluationModel, FrameworkChartType, FrameworkSectionTemplate } from '../types';

type ValidationResult =
  | { ok: true; framework: EvaluationFramework }
  | { ok: false; error: string };

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const normalizeId = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

const validChartTypes: FrameworkChartType[] = ['radar', 'bar', 'mixed', 'cards'];

const validateSections = (sections: unknown): FrameworkSectionTemplate[] => {
  if (!Array.isArray(sections)) return [];

  return sections
    .map((section) => {
      if (!section || typeof section !== 'object') return null;
      const raw = section as Record<string, unknown>;
      const title = isNonEmptyString(raw.title) ? raw.title.trim() : '';
      if (!title) return null;

      const type = raw.type;
      const safeType = type === 'text' || type === 'list' || type === 'tags' ? type : 'text';

      return {
        id: isNonEmptyString(raw.id) ? raw.id : normalizeId(title),
        title,
        type: safeType,
        description: isNonEmptyString(raw.description) ? raw.description : undefined
      } satisfies FrameworkSectionTemplate;
    })
    .filter(Boolean) as FrameworkSectionTemplate[];
};

export const validateFrameworkPayload = (payload: unknown): ValidationResult => {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: '体系配置必须是 JSON 对象。' };
  }

  const raw = payload as Record<string, unknown>;
  const name = isNonEmptyString(raw.name) ? raw.name.trim() : '';
  if (!name) {
    return { ok: false, error: '缺少 name（体系名称）。' };
  }

  const description = isNonEmptyString(raw.description)
    ? raw.description.trim()
    : '用户自定义评测体系';

  if (!Array.isArray(raw.dimensions) || raw.dimensions.length === 0) {
    return { ok: false, error: 'dimensions 必须是非空数组。' };
  }

  const dimensions = raw.dimensions
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const dim = item as Record<string, unknown>;
      const dimName = isNonEmptyString(dim.name) ? dim.name.trim() : '';
      if (!dimName) return null;

      return {
        id: isNonEmptyString(dim.id) ? dim.id : normalizeId(dimName),
        name: dimName,
        definition: isNonEmptyString(dim.definition) ? dim.definition : `${dimName}相关体验表现`,
        weight: typeof dim.weight === 'number' ? dim.weight : undefined
      };
    })
    .filter(Boolean);

  if (dimensions.length === 0) {
    return { ok: false, error: 'dimensions 中至少需要一个合法维度（包含 name）。' };
  }

  const scoreRangePayload =
    raw.scoreRange && typeof raw.scoreRange === 'object'
      ? (raw.scoreRange as Record<string, unknown>)
      : {};
  const min = typeof scoreRangePayload.min === 'number' ? scoreRangePayload.min : 0;
  const max = typeof scoreRangePayload.max === 'number' ? scoreRangePayload.max : 100;

  if (max <= min) {
    return { ok: false, error: 'scoreRange 非法：max 必须大于 min。' };
  }

  const visualizationPayload =
    raw.visualization && typeof raw.visualization === 'object'
      ? (raw.visualization as Record<string, unknown>)
      : {};
  const primaryChart = validChartTypes.includes(visualizationPayload.primaryChart as FrameworkChartType)
    ? (visualizationPayload.primaryChart as FrameworkChartType)
    : 'radar';

  const framework: EvaluationFramework = {
    id: isNonEmptyString(raw.id) ? raw.id : normalizeId(name),
    name,
    source: 'custom',
    description,
    modelType: EvaluationModel.CUSTOM,
    scoreRange: { min, max },
    dimensions: dimensions as EvaluationFramework['dimensions'],
    visualization: { primaryChart },
    promptGuidelines: isNonEmptyString(raw.promptGuidelines)
      ? raw.promptGuidelines
      : '按照该自定义体系维度进行审计，并给出可执行建议。',
    reportSections: validateSections(raw.reportSections)
  };

  return { ok: true, framework };
};

export const parseFrameworkJson = (jsonContent: string): ValidationResult => {
  try {
    const parsed = JSON.parse(jsonContent);
    return validateFrameworkPayload(parsed);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `JSON 解析失败：${error.message}` : 'JSON 解析失败。'
    };
  }
};

export const CUSTOM_FRAMEWORK_TEMPLATE = {
  name: '行业自定义评测体系',
  description: '按业务场景定义的灵活评测体系',
  scoreRange: { min: 0, max: 100 },
  visualization: { primaryChart: 'radar' },
  dimensions: [
    {
      name: '业务目标达成',
      definition: '关键业务目标是否能够被清晰、稳定、高效地达成',
      weight: 0.35
    },
    {
      name: '交互效率',
      definition: '完成主要任务需要的操作路径与认知负担',
      weight: 0.35
    },
    {
      name: '信任与安全感',
      definition: '用户对系统结果、数据处理和异常状态的信任程度',
      weight: 0.3
    }
  ],
  reportSections: [
    { title: '业务风险摘要', type: 'list' },
    { title: '优化优先级建议', type: 'list' }
  ],
  promptGuidelines: '请严格基于上述维度给出评分、问题定位和改进建议。'
};
