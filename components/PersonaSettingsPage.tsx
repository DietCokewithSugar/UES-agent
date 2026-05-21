import React, { useMemo, useState } from 'react';
import { Persona, PersonaLibraryScope, UserRole } from '../types';

interface PersonaAttributeRow {
  id: string;
  key: string;
  value: string;
}

type SettingsTab = 'user' | 'expert' | 'custom';
type ModalMode = 'create' | 'edit';

interface PersonaSettingsPageProps {
  publicPersonas: Persona[];
  customPersonas: Persona[];
  onPublicPersonasChange: (personas: Persona[]) => void;
  onCustomPersonasChange: (personas: Persona[]) => void;
  onBack: () => void;
}

const createAttributeRow = (key = '', value = ''): PersonaAttributeRow => ({
  id: `setting-attr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  key,
  value
});

const attributesToRows = (attributes: Record<string, string>): PersonaAttributeRow[] => {
  const entries = Object.entries(attributes || {});
  if (!entries.length) return [createAttributeRow()];
  return entries.map(([key, value]) => createAttributeRow(key, value));
};

const normalizeAttributesInput = (rows: PersonaAttributeRow[]) =>
  rows.reduce<Record<string, string>>((acc, row) => {
    const key = row.key.trim();
    if (!key) return acc;
    acc[key] = row.value.trim();
    return acc;
  }, {});

const getRoleLabel = (role: UserRole) => (role === UserRole.EXPERT ? '专家角色' : '用户角色');

const getEmptyDraft = (role: UserRole): Omit<Persona, 'id'> => ({
  name: '',
  role,
  description: '',
  attributes: {}
});

const matchesPersona = (persona: Persona, keyword: string) => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return true;
  const haystack = [
    persona.name,
    persona.description,
    persona.role,
    ...Object.entries(persona.attributes || {}).flatMap(([key, value]) => [key, value])
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(normalizedKeyword);
};

export function PersonaSettingsPage({
  publicPersonas,
  customPersonas,
  onPublicPersonasChange,
  onCustomPersonasChange,
  onBack
}: PersonaSettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('user');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [modalScope, setModalScope] = useState<PersonaLibraryScope>('public');
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<Persona, 'id'>>(getEmptyDraft(UserRole.USER));
  const [draftRows, setDraftRows] = useState<PersonaAttributeRow[]>([createAttributeRow()]);
  const [error, setError] = useState<string | null>(null);

  const visiblePersonas = useMemo(() => {
    const source =
      activeTab === 'custom'
        ? customPersonas
        : publicPersonas.filter((persona) =>
            activeTab === 'expert' ? persona.role === UserRole.EXPERT : persona.role === UserRole.USER
          );
    return source.filter((persona) => matchesPersona(persona, searchQuery));
  }, [activeTab, customPersonas, publicPersonas, searchQuery]);

  const tabConfigs: Array<{ key: SettingsTab; label: string; count: number; description: string }> = [
    {
      key: 'user',
      label: '用户角色',
      count: publicPersonas.filter((persona) => persona.role === UserRole.USER).length,
      description: '公共用户角色，步骤 4 只可选择，需在此页面统一维护。'
    },
    {
      key: 'expert',
      label: '专家角色',
      count: publicPersonas.filter((persona) => persona.role === UserRole.EXPERT).length,
      description: '公共专家角色，适合 UX、产品、业务等专业评审视角。'
    },
    {
      key: 'custom',
      label: '自建角色',
      count: customPersonas.length,
      description: '当前浏览器用户自己的角色库，仅在本地可见。'
    }
  ];

  const closeModal = () => {
    setModalOpen(false);
    setEditingPersonaId(null);
    setDraft(getEmptyDraft(UserRole.USER));
    setDraftRows([createAttributeRow()]);
    setError(null);
  };

  const openCreateModal = () => {
    const role = activeTab === 'expert' ? UserRole.EXPERT : UserRole.USER;
    setModalMode('create');
    setModalScope(activeTab === 'custom' ? 'custom' : 'public');
    setEditingPersonaId(null);
    setDraft(getEmptyDraft(role));
    setDraftRows([createAttributeRow()]);
    setModalOpen(true);
  };

  const openEditModal = (persona: Persona) => {
    setModalMode('edit');
    setModalScope(activeTab === 'custom' ? 'custom' : 'public');
    setEditingPersonaId(persona.id);
    setDraft({
      name: persona.name,
      role: persona.role,
      description: persona.description,
      attributes: { ...persona.attributes }
    });
    setDraftRows(attributesToRows(persona.attributes));
    setModalOpen(true);
  };

  const updateDraftField = (key: keyof Omit<Persona, 'id' | 'attributes'>, value: string) => {
    setDraft((previous) => ({
      ...previous,
      [key]: key === 'role' ? (value as UserRole) : value
    }));
  };

  const updateAttributeRow = (rowId: string, key: 'key' | 'value', value: string) => {
    setDraftRows((previous) =>
      previous.map((row) => (row.id === rowId ? { ...row, [key]: value } : row))
    );
  };

  const addAttributeRow = () => {
    setDraftRows((previous) => [...previous, createAttributeRow()]);
  };

  const removeAttributeRow = (rowId: string) => {
    setDraftRows((previous) => {
      if (previous.length <= 1) return [{ ...previous[0], key: '', value: '' }];
      return previous.filter((row) => row.id !== rowId);
    });
  };

  const upsertPersona = () => {
    const normalizedName = draft.name.trim();
    const normalizedDescription = draft.description.trim();
    if (!normalizedName || !normalizedDescription || !draft.role) {
      setError('角色名称、角色描述、角色类型为必填项。');
      return;
    }

    const payload: Omit<Persona, 'id'> = {
      name: normalizedName,
      role: draft.role,
      description: normalizedDescription,
      attributes: normalizeAttributesInput(draftRows)
    };

    const source = modalScope === 'public' ? publicPersonas : customPersonas;
    const onChange = modalScope === 'public' ? onPublicPersonasChange : onCustomPersonasChange;

    if (modalMode === 'edit' && editingPersonaId) {
      onChange(source.map((persona) => (persona.id === editingPersonaId ? { ...persona, ...payload } : persona)));
    } else {
      onChange([...source, { ...payload, id: `persona-${Date.now()}` }]);
    }
    closeModal();
  };

  const deletePersona = (persona: Persona) => {
    const confirmed = window.confirm(`确认删除角色「${persona.name}」吗？删除后步骤 4 中也将不可再选择。`);
    if (!confirmed) return;

    if (activeTab === 'custom') {
      onCustomPersonasChange(customPersonas.filter((item) => item.id !== persona.id));
      return;
    }
    onPublicPersonasChange(publicPersonas.filter((item) => item.id !== persona.id));
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">/setting</p>
              <h1 className="text-2xl font-semibold">评测角色设置</h1>
              <p className="text-sm text-slate-600">
                在这里统一维护公共用户角色、专家角色和个人自建角色；步骤 4 会实时读取这些角色。
              </p>
            </div>
            <button onClick={onBack} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
              返回评测
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {tabConfigs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-xl border px-4 py-2 text-sm ${
                    activeTab === tab.key
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {tab.label} · {tab.count}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索角色名称、描述或维度"
                className="min-w-[240px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button onClick={openCreateModal} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                新建角色
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            {tabConfigs.find((tab) => tab.key === activeTab)?.description}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {visiblePersonas.map((persona) => (
              <article key={persona.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{persona.name}</p>
                    <p className="mt-1 text-sm text-slate-600">{persona.description}</p>
                    <p className="mt-2 text-xs text-slate-500">{getRoleLabel(persona.role)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => openEditModal(persona)} className="text-xs text-slate-600 underline">
                      编辑
                    </button>
                    <button onClick={() => deletePersona(persona)} className="text-xs text-rose-600 underline">
                      删除
                    </button>
                  </div>
                </div>
                {!!Object.keys(persona.attributes || {}).length && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(persona.attributes).map(([key, value]) => (
                      <span key={key} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                        {key}: {value || '未填写'}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>

          {!visiblePersonas.length && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              暂无匹配角色，可调整搜索词或新建角色。
            </div>
          )}
        </section>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {modalMode === 'create' ? '新建评测角色' : '编辑评测角色'}
                </p>
                <p className="text-xs text-slate-500">
                  {modalScope === 'public' ? '当前修改公共角色库。' : '当前修改个人自建角色库。'}
                </p>
              </div>
              <button onClick={closeModal} className="text-xs text-slate-500 underline">
                关闭
              </button>
            </div>

            {error && <div className="mx-4 mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

            <div className="max-h-[70vh] overflow-y-auto space-y-4 px-4 py-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">角色名称（必填）</span>
                  <input
                    value={draft.name}
                    onChange={(event) => updateDraftField('name', event.target.value)}
                    placeholder="例如：新手小白"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">角色描述（必填）</span>
                  <textarea
                    value={draft.description}
                    onChange={(event) => updateDraftField('description', event.target.value)}
                    placeholder="描述该角色的使用背景、核心目标和关注点。"
                    rows={3}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-slate-600">角色类型（必填）</span>
                  <select
                    value={draft.role}
                    onChange={(event) => updateDraftField('role', event.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value={UserRole.USER}>用户角色</option>
                    <option value={UserRole.EXPERT}>专家角色</option>
                  </select>
                </label>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">角色维度（可选）</p>
                  <button onClick={addAttributeRow} className="text-xs text-slate-600 underline">
                    + 新增维度
                  </button>
                </div>
                <div className="space-y-2">
                  {draftRows.map((row, index) => (
                    <div key={row.id} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                      <input
                        value={row.key}
                        onChange={(event) => updateAttributeRow(row.id, 'key', event.target.value)}
                        placeholder="维度名称（如：类别）"
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                      <input
                        value={row.value}
                        onChange={(event) => updateAttributeRow(row.id, 'value', event.target.value)}
                        placeholder="维度描述（如：账户资产）"
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                      <button
                        onClick={() => removeAttributeRow(row.id)}
                        disabled={draftRows.length === 1 && index === 0 && !row.key.trim() && !row.value.trim()}
                        className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-600 disabled:opacity-40"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button onClick={closeModal} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                取消
              </button>
              <button onClick={upsertPersona} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
