import { Persona, UserRole } from '../types';

const STORAGE_KEY = 'ux-evaluation-personas-v1';

const hasStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const normalizeAttributes = (input: unknown): Record<string, string> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  return Object.entries(input as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      const normalizedKey = key.trim();
      if (!normalizedKey) return acc;
      acc[normalizedKey] = typeof value === 'string' ? value : value == null ? '' : String(value);
      return acc;
    },
    {}
  );
};

const normalizeRole = (value: unknown): UserRole =>
  value === UserRole.EXPERT ? UserRole.EXPERT : UserRole.USER;

const normalizePersona = (input: unknown, index: number): Persona | null => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (!name || !description) return null;

  return {
    id:
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : `persona-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    role: normalizeRole(raw.role),
    description,
    attributes: normalizeAttributes(raw.attributes)
  };
};

export const loadPersonas = (fallback: Persona[]): Persona[] => {
  if (!hasStorage()) return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;

    const normalized = parsed
      .map((item, index) => normalizePersona(item, index))
      .filter(Boolean) as Persona[];

    return normalized.length ? normalized : fallback;
  } catch {
    return fallback;
  }
};

export const savePersonas = (personas: Persona[]): { ok: true } | { ok: false; error: string } => {
  if (!hasStorage()) return { ok: false, error: '当前环境不支持本地角色缓存。' };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(personas));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '角色缓存保存失败'
    };
  }
};

export const clearPersonas = (): void => {
  if (!hasStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
};
