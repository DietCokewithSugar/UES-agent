import React, { useMemo, useState } from 'react';
import { Persona, UserRole } from '../types';

interface PersonaSettingsPageProps {
  personas: Persona[];
  onBack: () => void;
  onCreate: (draft: Omit<Persona, 'id'>) => void;
  onUpdate: (id: string, draft: Omit<Persona, 'id'>) => void;
  onDelete: (id: string) => void;
}

interface AttributeRow {
  id: string;
  key: string;
  value: string;
}

type SettingsTab = 'user' | 'expert';

const createAttributeRow = (key = '', value = ''): AttributeRow => ({
  id: `attr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  key,
  value
});

const attributesToRows = (attributes: Record<string, string>): AttributeRow[] => {
  const entries = Object.entries(attributes || {});
  if (!entries.length) return [createAttributeRow()];
  return entries.map(([key, value]) => createAttributeRow(key, value));
};

const rowsToAttributes = (rows: AttributeRow[]): Record<string, string> =>
  rows.reduce<Record<string, string>>((acc, row) => {
    const key = row.key.trim();
    if (!key) return acc;
    acc[key] = row.value.trim();
    return acc;
  }, {});

export const PersonaSettingsPage: React.FC<PersonaSettingsPageProps> = ({
  personas,
  onBack,
  onCreate,
  onUpdate,
  onDelete
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('user');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [draftRows, setDraftRows] = useState<AttributeRow[]>([createAttributeRow()]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const builtinPersonas = useMemo(
    () => personas.filter((persona) => persona.source === 'builtin'),
    [personas]
  );

  const userPersonas = useMemo(
    () => builtinPersonas.filter((persona) => persona.role === UserRole.USER),
    [builtinPersonas]
  );

  const expertPersonas = useMemo(
    () => builtinPersonas.filter((persona) => persona.role === UserRole.EXPERT),
    [builtinPersonas]
  );

  const currentList = activeTab === 'user' ? userPersonas : expertPersonas;
  const activeRole = activeTab === 'user' ? UserRole.USER : UserRole.EXPERT;
  const activeRoleLabel = activeTab === 'user' ? '用户角色' : '专家角色';

  const groupedList = useMemo(() => {
    const groups = new Map<string, Persona[]>();
    currentList.forEach((persona) => {
      const key = persona.category?.trim() || '未分类';
      const arr = groups.get(key) || [];
      arr.push(persona);
      groups.set(key, arr);
    });
    return Array.from(groups.entries());
  }, [currentList]);

  const resetDraft = () => {
    setEditingId(null);
    setIsCreating(false);
    setDraftName('');
    setDraftDescription('');
    setDraftCategory('');
    setDraftRows([createAttributeRow()]);
  };

  const startCreate = () => {
    resetDraft();
    setIsCreating(true);
  };

  const startEdit = (persona: Persona) => {
    setIsCreating(false);
    setEditingId(persona.id);
    setDraftName(persona.name);
    setDraftDescription(persona.description);
    setDraftCategory(persona.category || '');
    setDraftRows(attributesToRows(persona.attributes));
    setErrorMessage(null);
  };

  const cancelEdit = () => {
    resetDraft();
    setErrorMessage(null);
  };

  const submitDraft = () => {
    const name = draftName.trim();
    const description = draftDescription.trim();
    if (!name || !description) {
      setErrorMessage('角色名称、角色描述为必填项。');
      return;
    }
    const payload: Omit<Persona, 'id'> = {
      name,
      description,
      role: activeRole,
      source: 'builtin',
      category: draftCategory.trim() || undefined,
      attributes: rowsToAttributes(draftRows)
    };

    if (editingId) {
      onUpdate(editingId, payload);
      setInfoMessage(`已更新${activeRoleLabel}「${name}」。`);
    } else {
      onCreate(payload);
      setInfoMessage(`已新建${activeRoleLabel}「${name}」。`);
    }
    setErrorMessage(null);
    resetDraft();
  };

  const handleDelete = (persona: Persona) => {
    const confirmed = window.confirm(
      `确认删除${activeRoleLabel}「${persona.name}」？\n该角色将从所有人的角色库中移除，无法找回。`
    );
    if (!confirmed) return;
    onDelete(persona.id);
    if (editingId === persona.id) resetDraft();
    setInfoMessage(`已删除${activeRoleLabel}「${persona.name}」。`);
  };

  const isEditingExisting = !!editingId;
  const isFormOpen = isCreating || isEditingExisting;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">角色库设置</h1>
            <p className="text-sm text-slate-600">
              管理「用户角色」与「专家角色」的官方角色库。这里维护的角色对所有评测者可见。自建角色仅在自己步骤 4 的「自建角色」分组里出现。
            </p>
          </div>
          <button
            onClick={onBack}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            返回首页
          </button>
        </div>
        <div className="flex gap-2 text-sm">
          {(['user', 'expert'] as SettingsTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                resetDraft();
                setErrorMessage(null);
              }}
              className={`rounded-lg border px-3 py-2 ${
                activeTab === tab ? 'border-slate-400 bg-slate-100' : 'border-slate-200'
              }`}
            >
              {tab === 'user' ? `用户角色（${userPersonas.length}）` : `专家角色（${expertPersonas.length}）`}
            </button>
          ))}
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>
      )}
      {infoMessage && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">{infoMessage}</div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{activeRoleLabel}列表</h2>
            <p className="text-xs text-slate-500">
              共 {currentList.length} 个{activeRoleLabel}。可编辑描述、维度，亦可新增或删除。
            </p>
          </div>
          <button
            onClick={startCreate}
            disabled={isFormOpen}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            新增{activeRoleLabel}
          </button>
        </div>

        {currentList.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            暂无{activeRoleLabel}，请点击「新增{activeRoleLabel}」创建。
          </div>
        ) : (
          <div className="space-y-3">
            {groupedList.map(([category, list]) => (
              <div key={category} className="rounded-xl border border-slate-200">
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                  {category}（{list.length}）
                </div>
                <div className="divide-y divide-slate-100">
                  {list.map((persona) => (
                    <div key={persona.id} className="flex items-start justify-between gap-3 p-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-800">{persona.name}</p>
                        <p className="text-xs text-slate-500">{persona.description}</p>
                        {!!Object.keys(persona.attributes || {}).length && (
                          <p className="text-[11px] text-slate-400">
                            维度：{Object.keys(persona.attributes).join(' / ')}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2 text-xs">
                        <button
                          onClick={() => startEdit(persona)}
                          className="rounded-md border border-slate-200 px-2.5 py-1 text-slate-700 hover:bg-slate-50"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(persona)}
                          className="rounded-md border border-rose-200 px-2.5 py-1 text-rose-700 hover:bg-rose-50"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {isFormOpen && (
        <section className="rounded-2xl border border-slate-300 bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">
                {editingId ? `编辑${activeRoleLabel}` : `新增${activeRoleLabel}`}
              </h2>
              <p className="text-xs text-slate-500">
                角色分类固定为「{activeRoleLabel}」，所有评测者可见。
              </p>
            </div>
            <button onClick={cancelEdit} className="text-xs text-slate-500 underline">
              取消
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-medium text-slate-600">角色名称（必填）</span>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="例如：年轻用户"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-medium text-slate-600">角色描述（必填）</span>
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                placeholder="该描述将拼接到最终 AI 提示词中，请尽量具体。"
                rows={3}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-medium text-slate-600">角色分组（可选）</span>
              <input
                value={draftCategory}
                onChange={(event) => setDraftCategory(event.target.value)}
                placeholder="例如：基础属性（人口学）/ 账户资产 / 投资理财 / 信贷"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">角色维度（可选，支持动态扩展）</p>
              <button
                onClick={() => setDraftRows((previous) => [...previous, createAttributeRow()])}
                className="text-xs text-slate-600 underline"
              >
                + 新增维度
              </button>
            </div>
            <div className="space-y-2">
              {draftRows.map((row, index) => (
                <div key={row.id} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <input
                    value={row.key}
                    onChange={(event) =>
                      setDraftRows((previous) =>
                        previous.map((item) => (item.id === row.id ? { ...item, key: event.target.value } : item))
                      )
                    }
                    placeholder="维度名称（如：风险偏好）"
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={row.value}
                    onChange={(event) =>
                      setDraftRows((previous) =>
                        previous.map((item) => (item.id === row.id ? { ...item, value: event.target.value } : item))
                      )
                    }
                    placeholder="维度描述（如：低）"
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() =>
                      setDraftRows((previous) => {
                        if (previous.length <= 1) {
                          return [{ ...previous[0], key: '', value: '' }];
                        }
                        return previous.filter((item) => item.id !== row.id);
                      })
                    }
                    disabled={draftRows.length === 1 && index === 0 && !row.key.trim() && !row.value.trim()}
                    className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-600 disabled:opacity-40"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button onClick={cancelEdit} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
              取消
            </button>
            <button onClick={submitDraft} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
              {editingId ? '保存修改' : '创建'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
