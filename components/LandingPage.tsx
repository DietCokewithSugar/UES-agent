import React from 'react';

interface LandingPageProps {
  hasStoredDraft: boolean;
  draftSavedAt: string | null;
  onStartEvaluation: () => void;
  onRestoreDraft: () => void;
}

const FEATURES = [
  {
    title: '多类型素材输入',
    description: '支持单页截图、流程截图和视频录屏，覆盖不同评测场景。'
  },
  {
    title: 'AI 场景提炼',
    description: '可基于素材自动生成业务场景草稿，减少配置时间。'
  },
  {
    title: '可插拔评测体系',
    description: '内置 ETS / HEART / SUS-Lite / UEQ-Lite，也支持导入自定义体系。'
  },
  {
    title: '多角色评测',
    description: '支持预设角色、导入角色、AI 推荐与文档提取角色画像。'
  },
  {
    title: 'A/B 对比评测',
    description: '同一角色并行对比两套方案，输出维度差异与决策建议。'
  },
  {
    title: '报告导出',
    description: '支持单份 PNG 导出与批量 ZIP 导出，便于评审与归档。'
  }
];

const WORKFLOW_STEPS = [
  '上传素材（截图 / 流程 / 视频）',
  '补充业务场景与评测目标',
  '选择评测体系与评测角色',
  '生成报告并导出结论'
];

export const LandingPage: React.FC<LandingPageProps> = ({
  hasStoredDraft,
  draftSavedAt,
  onStartEvaluation,
  onRestoreDraft
}) => {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10 space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 space-y-4">
        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
          AI 用户体验评测平台
        </span>
        <h1 className="text-2xl md:text-4xl font-semibold tracking-tight text-slate-900">
          用更少步骤，完成更完整的体验评测
        </h1>
        <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-7">
          从素材上传、场景建模、角色分析到报告输出，集中在同一流程中完成。适合产品、设计、运营在评审前快速识别体验问题，并形成可执行优化建议。
        </p>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={onStartEvaluation}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
          >
            开始评测
          </button>
          <button
            onClick={onRestoreDraft}
            disabled={!hasStoredDraft}
            className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            恢复草稿
          </button>
        </div>

        {hasStoredDraft && draftSavedAt && (
          <p className="text-xs text-slate-500">
            检测到本地草稿：{new Date(draftSavedAt).toLocaleString()}
          </p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">{feature.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">使用流程</h2>
        <ol className="mt-3 space-y-2">
          {WORKFLOW_STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-3 text-sm text-slate-700">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">准备好开始了吗？</h2>
          <p className="mt-1 text-sm text-slate-600">进入配置页后即可上传素材并发起评测。</p>
        </div>
        <button
          onClick={onStartEvaluation}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
        >
          进入评测配置
        </button>
      </section>
    </div>
  );
};
