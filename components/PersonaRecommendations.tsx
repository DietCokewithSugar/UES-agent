import React from 'react';
import { Persona, PersonaRecommendation } from '../types';

interface PersonaRecommendationsProps {
  recommendations: PersonaRecommendation[];
  personas: Persona[];
  onAddExisting: (personaId: string) => void;
  onCreateFromDraft: (draft: Omit<Persona, 'id'>) => void;
}

export const PersonaRecommendations: React.FC<PersonaRecommendationsProps> = ({
  recommendations,
  personas,
  onAddExisting,
  onCreateFromDraft
}) => {
  if (recommendations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">
        暂无 AI 推荐角色。你可以先完善业务场景，再点击“AI 推荐角色”或“AI 生成新角色”。
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {recommendations.map((item) => {
        const existingPersona = item.existingPersonaId
          ? personas.find((persona) => persona.id === item.existingPersonaId)
          : null;

        return (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs rounded-full bg-violet-100 px-2 py-0.5 text-violet-700 font-semibold">
                    匹配度 {item.matchScore}
                  </span>
                  <span
                    className={`text-[11px] rounded-full px-2 py-0.5 font-semibold ${
                      existingPersona ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {existingPersona ? '复用已有角色' : 'AI 新角色'}
                  </span>
                  <span className="text-sm font-semibold text-slate-800">
                    {existingPersona?.name || item.personaDraft?.name || '新角色建议'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{item.reasoning}</p>
              </div>

              {existingPersona ? (
                <button
                  onClick={() => onAddExisting(existingPersona.id)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700"
                >
                  加入评测
                </button>
              ) : item.personaDraft ? (
                <button
                  onClick={() => onCreateFromDraft(item.personaDraft!)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700"
                >
                  保存并加入
                </button>
              ) : null}
            </div>

            {item.personaDraft && !existingPersona && (
              <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                {item.personaDraft.description}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
