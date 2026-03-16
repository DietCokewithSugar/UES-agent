import React from 'react';
import { EvaluationScenario } from '../types';

interface ScenarioEditorProps {
  scenario: EvaluationScenario;
  onChange: (next: EvaluationScenario) => void;
  onInfer: () => void;
  isInferring: boolean;
  canInfer: boolean;
  showAiGuide: boolean;
  onDismissAiGuide: () => void;
}

const INDUSTRY_OPTIONS = ['电商', '金融', '医疗', '教育', '企业服务', '文娱', '政务', '其他'];
const PRODUCT_OPTIONS = ['移动 App', 'Web 网站', '管理后台', 'SaaS 平台', '小程序', 'IoT 终端', '其他'];

const QUICK_TEMPLATES: Record<'businessGoal' | 'targetUsers' | 'keyTasks' | 'painPoints' | 'successCriteria', string[]> = {
  businessGoal: [
    '验证新用户能否在 3 分钟内完成首个核心任务',
    '降低关键流程中的误操作与中断率',
    '提升核心功能的理解效率和操作确定性'
  ],
  targetUsers: ['首次使用用户', '高频专业用户', '银发/低技术熟练用户'],
  keyTasks: ['完成注册并进入主流程', '搜索并执行一次核心操作', '异常情况下完成恢复与重试'],
  painPoints: ['页面信息密度高，关键按钮不易发现', '流程中缺少状态反馈，用户不确定是否成功', '异常后缺少恢复路径，导致任务中断'],
  successCriteria: ['核心任务完成率 ≥ 90%', '关键步骤平均耗时下降 20%', '一级问题数量下降 50%']
};

const FIELD_CONFIG: Array<{
  key: keyof EvaluationScenario;
  label: string;
  placeholder: string;
  rows?: number;
}> = [
  { key: 'businessGoal', label: '评测目标', placeholder: '你想验证什么体验目标？', rows: 2 },
  { key: 'targetUsers', label: '目标用户', placeholder: '如：新手用户、银发人群、专业运营人员', rows: 2 },
  { key: 'keyTasks', label: '关键任务流', placeholder: '用户需要完成的核心任务是什么？', rows: 2 },
  { key: 'painPoints', label: '用户痛点', placeholder: '当前存在的主要痛点或疑虑', rows: 2 },
  { key: 'successCriteria', label: '成功标准', placeholder: '如：完成率>90%，错误率<5%，时间缩短30%', rows: 2 },
  { key: 'constraints', label: '约束条件', placeholder: '如：合规要求、终端限制、发布时间窗口', rows: 2 }
];

const TEMPLATE_PACKS: Array<{
  id: string;
  title: string;
  summary: string;
  values: Partial<EvaluationScenario>;
}> = [
  {
    id: 'new-user-onboarding',
    title: '新用户首登转化',
    summary: '适用于注册/首次使用链路',
    values: {
      industry: '电商',
      productType: '移动 App',
      businessGoal: '验证新用户是否能在首次访问中快速理解价值并完成首单',
      targetUsers: '首次安装的新用户，年龄 20-40 岁',
      keyTasks: '完成注册、浏览商品、下单支付',
      painPoints: '注册流程长、优惠信息分散、支付安全感不足',
      successCriteria: '首单完成率提升 15%，注册到首单耗时下降 20%'
    }
  },
  {
    id: 'backoffice-efficiency',
    title: '后台效率提升',
    summary: '适用于管理后台与 SaaS 控制台',
    values: {
      industry: '企业服务',
      productType: '管理后台',
      businessGoal: '降低运营人员执行高频任务的时间和误操作率',
      targetUsers: '日均高频操作的运营、审核与客服人员',
      keyTasks: '查询数据、批量处理、异常回滚',
      painPoints: '入口层级深、表格信息噪音高、批量操作反馈慢',
      successCriteria: '任务完成时间下降 25%，关键任务误操作率低于 3%'
    }
  },
  {
    id: 'service-safety',
    title: '服务可信与可达',
    summary: '适用于金融/医疗等高风险链路',
    values: {
      industry: '金融',
      productType: 'Web 网站',
      businessGoal: '确保用户在高风险任务中有足够的理解、确认和可追踪反馈',
      targetUsers: '风险敏感用户、低技术熟练用户',
      keyTasks: '完成信息确认、关键交易、结果复核',
      painPoints: '术语理解成本高、确认步骤不清晰、错误提示不可执行',
      successCriteria: '关键任务一次成功率 ≥ 95%，用户主观安全感显著提升'
    }
  }
];

export const ScenarioEditor: React.FC<ScenarioEditorProps> = ({
  scenario,
  onChange,
  onInfer,
  isInferring,
  canInfer,
  showAiGuide,
  onDismissAiGuide
}) => {
  const updateField = (key: keyof EvaluationScenario, value: string) => {
    onChange({
      ...scenario,
      [key]: value,
      source: scenario.source === 'ai_inferred' ? 'mixed' : scenario.source
    });
  };

  const applyTemplatePack = (values: Partial<EvaluationScenario>) => {
    onChange({
      ...scenario,
      ...values,
      source: scenario.source === 'ai_inferred' ? 'mixed' : scenario.source
    });
  };

  const isFieldComplete = (key: keyof EvaluationScenario) => Boolean((scenario[key] as string)?.trim());

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
      {showAiGuide && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-violet-800">建议先用 AI 快速起草场景</p>
          <p className="text-xs text-violet-700">
            你已上传素材后，可先点击“AI 从素材提炼场景”，系统会自动生成行业、目标、任务等字段，再手动微调。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onInfer}
              disabled={!canInfer || isInferring}
              className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 disabled:opacity-50"
            >
              {isInferring ? 'AI 提炼中...' : '立即使用 AI 提炼'}
            </button>
            <button onClick={onDismissAiGuide} className="rounded-lg border border-violet-200 px-3 py-1.5 text-xs text-violet-700">
              我已了解
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">业务场景与评测目标</h3>
          <p className="text-xs text-slate-500 mt-1">
            先定义“在什么业务场景下，要评测什么”，再进入报告阶段，能显著提高评测结果相关性。
          </p>
        </div>
        <button
          onClick={onInfer}
          disabled={!canInfer || isInferring}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          title="根据已上传素材自动提炼场景字段，后续仍可手动修改"
        >
          {isInferring ? 'AI 提炼中...' : 'AI 从素材提炼场景'}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-600">AI 推荐模板（可一键填充关键字段）</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {TEMPLATE_PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => applyTemplatePack(pack.values)}
              className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-left hover:border-slate-300"
            >
              <p className="text-xs font-semibold text-slate-700">{pack.title}</p>
              <p className="mt-1 text-[11px] text-slate-500">{pack.summary}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="flex items-center justify-between text-xs font-medium text-slate-600">
            行业
            <span className={isFieldComplete('industry') ? 'text-emerald-600' : 'text-amber-600'}>
              {isFieldComplete('industry') ? '已填写' : '待填写'}
            </span>
          </span>
          <select
            value={scenario.industry}
            onChange={(event) => updateField('industry', event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            <option value="">请选择行业</option>
            {INDUSTRY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="flex items-center justify-between text-xs font-medium text-slate-600">
            产品类型
            <span className={isFieldComplete('productType') ? 'text-emerald-600' : 'text-amber-600'}>
              {isFieldComplete('productType') ? '已填写' : '待填写'}
            </span>
          </span>
          <select
            value={scenario.productType}
            onChange={(event) => updateField('productType', event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            <option value="">请选择产品类型</option>
            {PRODUCT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        {FIELD_CONFIG.map((field) => (
          <label key={field.key} className={field.rows ? 'md:col-span-2 space-y-1' : 'space-y-1'}>
            <span className="flex items-center justify-between text-xs font-medium text-slate-600">
              {field.label}
              <span className={isFieldComplete(field.key) ? 'text-emerald-600' : 'text-amber-600'}>
                {isFieldComplete(field.key) ? '已填写' : '待填写'}
              </span>
            </span>
            {field.rows ? (
              <>
                <textarea
                  value={scenario[field.key] as string}
                  onChange={(event) => updateField(field.key, event.target.value)}
                  rows={field.rows}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
                {(field.key === 'businessGoal' ||
                  field.key === 'targetUsers' ||
                  field.key === 'keyTasks' ||
                  field.key === 'painPoints' ||
                  field.key === 'successCriteria') && (
                  <div className="flex flex-wrap gap-2">
                    {QUICK_TEMPLATES[field.key as keyof typeof QUICK_TEMPLATES].map((template) => (
                      <button
                        type="button"
                        key={template}
                        onClick={() => updateField(field.key, template)}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600"
                      >
                        {template}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <input
                value={scenario[field.key] as string}
                onChange={(event) => updateField(field.key, event.target.value)}
                placeholder={field.placeholder}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              />
            )}
          </label>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-medium text-slate-700">小贴士</p>
        <ul className="mt-1 list-disc pl-4 text-[11px] text-slate-600 space-y-1">
          <li>优先描述“谁在什么情境下做什么任务”，再写痛点，AI 评测结果会更聚焦。</li>
          <li>
            首次使用建议阅读
            <a
              href="https://www.nngroup.com/articles/ux-research-cheat-sheet/"
              target="_blank"
              rel="noreferrer"
              className="ml-1 underline"
            >
              UX Research Cheat Sheet
            </a>
            。
          </li>
        </ul>
      </div>
    </section>
  );
};
