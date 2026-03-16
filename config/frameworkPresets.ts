import { EvaluationFramework, EvaluationModel } from '../types';

export const FRAMEWORK_PRESETS: EvaluationFramework[] = [
  {
    id: 'ets',
    name: 'ETS',
    source: 'builtin',
    description: '企业级体验审计体系，覆盖功能流程、交互、视觉、安全、运营等 8 个维度。',
    modelType: EvaluationModel.ETS,
    scoreRange: { min: 0, max: 100 },
    visualization: { primaryChart: 'radar' },
    dimensions: [
      { id: 'ets-function', name: '功能流程', definition: '功能完整度、逻辑闭环、辅助提示及流程可追踪性。' },
      { id: 'ets-information', name: '信息认知', definition: '信息完整性、可读性、语义一致性。' },
      { id: 'ets-interaction', name: '交互设计', definition: '状态可见、布局合理、操作便捷、安全和一致。' },
      { id: 'ets-system', name: '系统性能', definition: '视觉响应、状态反馈、异常/加载表现。' },
      { id: 'ets-security', name: '信息安全', definition: '隐私保护、交易安全、风险预警。' },
      { id: 'ets-visual', name: '视觉设计', definition: '布局层级、风格一致、美观与品牌感。' },
      { id: 'ets-intelligence', name: '智能化', definition: '用户洞察、指令理解、情感连接。' },
      { id: 'ets-operation', name: '运营服务', definition: '内容运营有效性、服务响应与专业度。' }
    ],
    reportSections: [
      { id: 'ets-risk', title: '风险与优先级', type: 'list' },
      { id: 'ets-roadmap', title: '优化路线图', type: 'list' }
    ],
    promptGuidelines: `严格按 ETS 8 维审计。系统性能不可臆测毫秒延迟，基于可见证据评估。`
  },
  {
    id: 'heart',
    name: 'HEART',
    source: 'builtin',
    description: 'Google HEART 体验度量框架（Happiness、Engagement、Adoption、Retention、Task Success）。',
    modelType: EvaluationModel.HEART,
    scoreRange: { min: 0, max: 100 },
    visualization: { primaryChart: 'radar' },
    dimensions: [
      { id: 'heart-h', name: 'Happiness', definition: '用户情绪、满意度和主观体验好感。' },
      { id: 'heart-e', name: 'Engagement', definition: '交互粘性、停留质量与操作投入感。' },
      { id: 'heart-a', name: 'Adoption', definition: '新功能或关键路径的接受度与上手意愿。' },
      { id: 'heart-r', name: 'Retention', definition: '可持续使用动机、回访与长期价值潜力。' },
      { id: 'heart-t', name: 'Task Success', definition: '任务完成率、效率、错误恢复能力。' }
    ],
    reportSections: [
      { id: 'heart-goals', title: '目标-信号-指标建议', type: 'list' },
      { id: 'heart-evidence', title: '证据与监测建议', type: 'list' }
    ],
    promptGuidelines: `HEART 评估需强调“AI代理估计”，并给出每个维度的证据与置信度说明。`
  },
  {
    id: 'sus-lite',
    name: 'SUS-Lite',
    source: 'builtin',
    description: '基于 SUS 可用性量表思想的 AI 代理评估版本，面向快速可用性判断。',
    modelType: EvaluationModel.SUS_LITE,
    scoreRange: { min: 0, max: 100 },
    visualization: { primaryChart: 'bar' },
    dimensions: [
      { id: 'sus-lite-overall', name: '可用性总观', definition: '系统易用性、理解成本、操作负担的综合评价。' },
      { id: 'sus-lite-learn', name: '易学性', definition: '首次使用能否快速学会核心操作。' },
      { id: 'sus-lite-efficiency', name: '效率感知', definition: '完成任务的步骤与认知负担是否合理。' },
      { id: 'sus-lite-confidence', name: '信心与可控感', definition: '用户是否感觉操作可控、结果可预期。' }
    ],
    reportSections: [
      { id: 'sus-lite-score-map', title: 'SUS 等级映射', type: 'tags' },
      { id: 'sus-lite-risk', title: '主要可用性阻塞点', type: 'list' }
    ],
    promptGuidelines: `需输出接近 SUS 的可用性解释，并说明 AI 代理评估与真实问卷的差异。`
  },
  {
    id: 'ueq-lite',
    name: 'UEQ-Lite',
    source: 'builtin',
    description: '基于 UEQ 思路的轻量评估，关注实用质量与愉悦质量的平衡。',
    modelType: EvaluationModel.UEQ_LITE,
    scoreRange: { min: 0, max: 100 },
    visualization: { primaryChart: 'bar' },
    dimensions: [
      { id: 'ueq-lite-pragmatic', name: 'Pragmatic Quality', definition: '是否高效、可控、目标导向。' },
      { id: 'ueq-lite-hedonic', name: 'Hedonic Quality', definition: '是否有吸引力、创新感和情感价值。' },
      { id: 'ueq-lite-clarity', name: '清晰与可理解', definition: '信息表达是否直观明了。' },
      { id: 'ueq-lite-delight', name: '愉悦与品牌感', definition: '视觉与交互是否带来正向体验。' }
    ],
    reportSections: [
      { id: 'ueq-lite-balance', title: '务实-愉悦平衡结论', type: 'text' },
      { id: 'ueq-lite-actions', title: '体验增益动作', type: 'list' }
    ],
    promptGuidelines: `重点分析实用性与愉悦性平衡，并给出可执行提升建议。`
  }
];

export const DEFAULT_FRAMEWORK_ID = 'ets';

export const getFrameworkById = (frameworkId: string): EvaluationFramework | undefined =>
  FRAMEWORK_PRESETS.find((framework) => framework.id === frameworkId);
