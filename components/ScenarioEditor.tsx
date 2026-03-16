import React from 'react';
import { EvaluationScenario } from '../types';
import { Sparkles } from 'lucide-react';

interface ScenarioEditorProps {
  scenario: EvaluationScenario;
  onChange: (next: EvaluationScenario) => void;
  onInfer: () => void;
  isInferring: boolean;
  canInfer: boolean;
}

const FIELD_CONFIG: Array<{
  key: keyof EvaluationScenario;
  label: string;
  placeholder: string;
  rows?: number;
}> = [
  { key: 'industry', label: '行业', placeholder: '如：电商 / 医疗 / 金融 / 教育' },
  { key: 'productType', label: '产品类型', placeholder: '如：移动 App / 管理后台 / SaaS 平台' },
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
            先定义“在什么业务场景下，要评测什么”，AI 才能输出更有针对性的报告。
          </p>
        </div>
        <button
          onClick={onInfer}
          disabled={!canInfer || isInferring}
          className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 disabled:opacity-50"
        >
          <Sparkles size={14} />
          {isInferring ? 'AI 提炼中...' : 'AI 从素材提炼场景'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FIELD_CONFIG.map((field) => (
          <label key={field.key} className={field.rows ? 'md:col-span-2 space-y-1' : 'space-y-1'}>
            <span className="text-xs font-medium text-slate-600">{field.label}</span>
            {field.rows ? (
              <textarea
                value={scenario[field.key] as string}
                onChange={(event) => updateField(field.key, event.target.value)}
                rows={field.rows}
                placeholder={field.placeholder}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
            ) : (
              <input
                value={scenario[field.key] as string}
                onChange={(event) => updateField(field.key, event.target.value)}
                placeholder={field.placeholder}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
            )}
          </label>
        ))}
      </div>
    </section>
  );
};
