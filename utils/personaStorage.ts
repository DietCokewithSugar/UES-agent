import { Persona, PersonaSource, UserRole } from '../types';
import { DEFAULT_BUILTIN_PERSONA_IDS } from '../config/defaultPersonas';

const STORAGE_KEY = 'ux-evaluation-personas-v1';
const MIGRATION_KEY = 'ux-evaluation-personas-migration';
const CURRENT_MIGRATION = 'role-refactor-v1';

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

const normalizeSource = (value: unknown, id: string): PersonaSource => {
  if (value === 'builtin' || value === 'custom') return value;
  // Backwards compat: legacy personas without source. Known IDs are builtin.
  return DEFAULT_BUILTIN_PERSONA_IDS.has(id) ? 'builtin' : 'custom';
};

const normalizePersona = (input: unknown, index: number): Persona | null => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (!name || !description) return null;

  const id =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : `persona-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    name,
    role: normalizeRole(raw.role),
    source: normalizeSource(raw.source, id),
    category: typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : undefined,
    description,
    attributes: normalizeAttributes(raw.attributes)
  };
};

export const loadPersonas = (defaults: Persona[]): Persona[] => {
  if (!hasStorage()) return defaults;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      window.localStorage.setItem(MIGRATION_KEY, CURRENT_MIGRATION);
      return defaults;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;

    const normalized = parsed
      .map((item, index) => normalizePersona(item, index))
      .filter(Boolean) as Persona[];

    const migration = window.localStorage.getItem(MIGRATION_KEY);
    if (migration !== CURRENT_MIGRATION) {
      // One-time migration: inject any new builtin defaults that the user does not yet have.
      const existingIds = new Set(normalized.map((p) => p.id));
      for (const def of defaults) {
        if (def.source === 'builtin' && !existingIds.has(def.id)) {
          normalized.push(def);
        }
      }
      window.localStorage.setItem(MIGRATION_KEY, CURRENT_MIGRATION);
    }

    return normalized.length ? normalized : defaults;
  } catch {
    return defaults;
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
  window.localStorage.removeItem(MIGRATION_KEY);
};
