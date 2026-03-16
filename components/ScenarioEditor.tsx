import React from 'react';
import { EvaluationScenario } from '../types';

interface ScenarioEditorProps {
  scenario: EvaluationScenario;
  onChange: (next: EvaluationScenario) => void;
  onInfer: () => void;
  isInferring: boolean;
  canInfer: boolean;
}

const INDUSTRY_OPTIONS = ['电商', '金融', '医疗', '教育', '企业服务', '文娱', '政务', '其他'];
const PRODUCT_OPTIONS = ['移动 App', 'Web 网站', '管理后台', 'SaaS 平台', '小程序', 'IoT 终端', '其他'];

const QUICK_TEMPLATES: Record<'businessGoal' | 'targetUsers' | 'keyTasks', string[]> = {
  businessGoal: [
    '验证新用户能否在 3 分钟内完成首个核心任务',
    '降低关键流程中的误操作与中断率',
    '提升核心功能的理解效率和操作确定性'
  ],
  targetUsers: ['首次使用用户', '高频专业用户', '银发/低技术熟练用户'],
  keyTasks: ['完成注册并进入主流程', '搜索并执行一次核心操作', '异常情况下完成恢复与重试']
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

export const ScenarioEditor: React.FC<ScenarioEditorProps> = ({
  scenario,
  onChange,
  onInfer,
  isInferring,
  canInfer
}) => {
  const updateField = (key: keyof EvaluationScenario, value: string) => {
    onChange({
      ...scenario,
      [key]: value,
      source: scenario.source === 'ai_inferred' ? 'mixed' : scenario.source
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">行业</span>
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
          <span className="text-xs font-medium text-slate-600">产品类型</span>
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
            <span className="text-xs font-medium text-slate-600">{field.label}</span>
            {field.rows ? (
              <>
                <textarea
                  value={scenario[field.key] as string}
                  onChange={(event) => updateField(field.key, event.target.value)}
                  rows={field.rows}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
                {(field.key === 'businessGoal' || field.key === 'targetUsers' || field.key === 'keyTasks') && (
                  <div className="flex flex-wrap gap-2">
                    {QUICK_TEMPLATES[field.key].map((template) => (
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
    </section>
  );
};
