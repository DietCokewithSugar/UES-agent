import { Persona, PersonaLibrary, UserRole } from '../types';

const LEGACY_STORAGE_KEY = 'ux-evaluation-personas-v1';
const PUBLIC_STORAGE_KEY = 'ux-evaluation-public-personas-v2';
const CUSTOM_STORAGE_KEY = 'ux-evaluation-custom-personas-v2';

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

const readPersonaArray = (key: string): Persona[] | null => {
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return null;

  return parsed
    .map((item, index) => normalizePersona(item, index))
    .filter(Boolean) as Persona[];
};

const mergeLegacyPublicPersonas = (fallback: Persona[], legacyPersonas: Persona[]): Persona[] => {
  const fallbackIds = new Set(fallback.map((persona) => persona.id));
  const legacyByDefaultId = new Map(
    legacyPersonas
      .filter((persona) => fallbackIds.has(persona.id))
      .map((persona) => [persona.id, persona])
  );

  return fallback.map((persona) => legacyByDefaultId.get(persona.id) || persona);
};

export const loadPersonaLibrary = (fallbackPublicPersonas: Persona[]): PersonaLibrary => {
  if (!hasStorage()) {
    return {
      publicPersonas: fallbackPublicPersonas,
      customPersonas: []
    };
  }

  try {
    const publicPersonas = readPersonaArray(PUBLIC_STORAGE_KEY);
    const customPersonas = readPersonaArray(CUSTOM_STORAGE_KEY);
    if (publicPersonas || customPersonas) {
      return {
        publicPersonas: publicPersonas?.length ? publicPersonas : fallbackPublicPersonas,
        customPersonas: customPersonas || []
      };
    }

    const legacyPersonas = readPersonaArray(LEGACY_STORAGE_KEY);
    if (!legacyPersonas?.length) {
      return {
        publicPersonas: fallbackPublicPersonas,
        customPersonas: []
      };
    }

    const fallbackIds = new Set(fallbackPublicPersonas.map((persona) => persona.id));
    return {
      publicPersonas: mergeLegacyPublicPersonas(fallbackPublicPersonas, legacyPersonas),
      customPersonas: legacyPersonas.filter((persona) => !fallbackIds.has(persona.id))
    };
  } catch {
    return {
      publicPersonas: fallbackPublicPersonas,
      customPersonas: []
    };
  }
};

export const savePersonaLibrary = (
  library: PersonaLibrary
): { ok: true } | { ok: false; error: string } => {
  if (!hasStorage()) return { ok: false, error: '当前环境不支持本地角色缓存。' };

  try {
    window.localStorage.setItem(PUBLIC_STORAGE_KEY, JSON.stringify(library.publicPersonas));
    window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(library.customPersonas));
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
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  window.localStorage.removeItem(PUBLIC_STORAGE_KEY);
  window.localStorage.removeItem(CUSTOM_STORAGE_KEY);
};
