import { EvaluationScenario } from '../types';

export type DraftUploadMode = 'single' | 'flow' | 'video';
export type DraftSetupStep = 1 | 2 | 3 | 4;

export interface SetupDraft {
  version: 1;
  savedAt: string;
  uploadMode: DraftUploadMode;
  activeStep: DraftSetupStep;
  selectedFrameworkId: string;
  selectedPersonaIds: string[];
  scenario: EvaluationScenario;
  shouldGenerateImages: boolean;
  sourceMeta: {
    singleFileName: string;
    videoFileName: string;
    flowStepCount: number;
    flowStepNames: string[];
  };
}

const STORAGE_KEY = 'ux-evaluation-setup-draft-v1';

const hasStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const saveSetupDraft = (draft: SetupDraft): { ok: true } | { ok: false; error: string } => {
  if (!hasStorage()) return { ok: false, error: '当前环境不支持本地草稿存储。' };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '保存草稿失败'
    };
  }
};

export const loadSetupDraft = (): SetupDraft | null => {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SetupDraft;
    if (!parsed || parsed.version !== 1 || !parsed.scenario) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearSetupDraft = (): void => {
  if (!hasStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
};

