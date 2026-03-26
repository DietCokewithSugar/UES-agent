import React from 'react';

export const AiDisclaimer: React.FC = () => {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-sm font-semibold text-amber-800">AI 免责提示</h3>
      <p className="mt-2 text-xs leading-6 text-amber-700">
        本工具输出的体验评测结果由 AI 基于当前素材进行推断，可能存在偏差、遗漏或误判，仅可作为辅助决策参考，不应替代真实用户研究、业务数据验证与专业评审结论。
      </p>
    </section>
  );
};
