import { ApiConfig } from '../types';

const API_CONFIG_COOKIE_KEY = 'ues_api_config';
const API_CONFIG_COOKIE_AGE = 60 * 60 * 24 * 180;

const readCookieValue = (cookieKey: string): string | null => {
  if (typeof document === 'undefined') return null;
  const found = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${cookieKey}=`));
  if (!found) return null;
  return found.slice(cookieKey.length + 1);
};

const buildCookiePayload = (apiConfig: ApiConfig) =>
  JSON.stringify({
    provider: apiConfig.provider,
    googleModel: apiConfig.googleModel,
    openRouterModel: apiConfig.openRouterModel,
    imageModel: apiConfig.imageModel,
    googleApiKey: apiConfig.googleApiKey || '',
    openRouterApiKey: apiConfig.openRouterApiKey || ''
  });

export const loadApiConfigFromCookie = (): Partial<ApiConfig> | null => {
  const rawValue = readCookieValue(API_CONFIG_COOKIE_KEY);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue)) as Partial<ApiConfig>;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (error) {
    console.warn('load api config cookie failed', error);
    return null;
  }
};

export const saveApiConfigToCookie = (
  apiConfig: ApiConfig
): { ok: true } | { ok: false; error: string } => {
  if (typeof document === 'undefined') {
    return { ok: false, error: '当前环境不支持 Cookie 存储。' };
  }

  try {
    const payload = encodeURIComponent(buildCookiePayload(apiConfig));
    document.cookie = `${API_CONFIG_COOKIE_KEY}=${payload}; max-age=${API_CONFIG_COOKIE_AGE}; path=/; samesite=lax`;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '保存 Cookie 失败'
    };
  }
};

export const clearApiConfigCookie = () => {
  if (typeof document === 'undefined') return;
  document.cookie = `${API_CONFIG_COOKIE_KEY}=; max-age=0; path=/; samesite=lax`;
};
