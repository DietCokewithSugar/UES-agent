import React from 'react';
import { uxAnalysisAgent, uxKitAgent } from '../services/agents/registry';

interface LandingPageProps {
  hasStoredDraft: boolean;
  draftSavedAt: string | null;
  onStartEvaluation: () => void;
  onRestoreDraft: () => void;
  onStartCompanion: () => void;
  onStartAnalysis: () => void;
  onStartSkills: () => void;
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
  onRestoreDraft,
  onStartCompanion,
  onStartAnalysis,
  onStartSkills
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

      <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-6 md:p-7 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Agent Skills · 独立运行环境
            </span>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Skills 工作台</h2>
            <p className="text-sm leading-7 text-slate-600 md:text-base">
              上传兼容 Agent Skills 规范的 ZIP 包，为每条对话启用需要的技能，并查看渐进式技能调用轨迹。
            </p>
            <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs leading-6 text-slate-600 sm:grid-cols-2">
              <li>· 运行时上传与更新 SKILL.md</li>
              <li>· 每个对话分配独立容器或工作区</li>
              <li>· 先发现元数据，再按需加载技能正文</li>
              <li>· 支持 references / templates / scripts</li>
            </ul>
          </div>
          <button
            onClick={onStartSkills}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            进入 Skills 工作台
          </button>
        </div>
      </section>

      {[
        {
          agent: uxKitAgent,
          onClick: onStartCompanion,
          ring: 'border-violet-200 from-violet-50',
          pill: 'border-violet-300 text-violet-700',
          dot: 'bg-violet-500',
          button: 'bg-violet-600 hover:bg-violet-700',
          tag: '对话式技能 · 由 DeepSeek 驱动'
        },
        {
          agent: uxAnalysisAgent,
          onClick: onStartAnalysis,
          ring: 'border-sky-200 from-sky-50',
          pill: 'border-sky-300 text-sky-700',
          dot: 'bg-sky-500',
          button: 'bg-sky-600 hover:bg-sky-700',
          tag: '新功能 · 支持上传数据与图片'
        }
      ].map(({ agent, onClick, ring, pill, dot, button, tag }) => (
        <section
          key={agent.id}
          className={`rounded-2xl border bg-gradient-to-br via-white to-indigo-50 p-6 md:p-7 shadow-sm ${ring}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3 max-w-2xl">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1 text-xs font-semibold ${pill}`}
              >
                <span className={`inline-flex h-1.5 w-1.5 rounded-full ${dot}`} />
                {tag}
              </span>
              <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900">
                {agent.nav.landing.heading}
              </h2>
              <p className="text-sm md:text-base text-slate-600 leading-7">
                {agent.nav.landing.description}
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 leading-6">
                {agent.nav.landing.bullets.map(b => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={onClick}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm ${button}`}
              >
                {agent.nav.landing.cta}
              </button>
              <span className="text-[11px] text-slate-500">需要在 .env.local 配置 DEEPSEEK_API_KEY</span>
            </div>
          </div>
        </section>
      ))}

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
