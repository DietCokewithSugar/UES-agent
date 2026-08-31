import React, { useEffect, useState } from 'react';

interface Props {
  children: React.ReactNode;
}

export const AppAccessGate: React.FC<Props> = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/auth/status')
      .then(response => response.json())
      .then(status => setAuthenticated(Boolean(status.authenticated)))
      .catch(() => setError('无法连接服务端，请稍后重试。'))
      .finally(() => setChecking(false));
  }, []);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || '登录失败');
      setAuthenticated(true);
      setToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">正在验证访问权限…</div>;
  }
  if (authenticated) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={login} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 font-bold text-violet-700">
          UES
        </div>
        <h1 className="mt-4 text-center text-xl font-semibold text-slate-900">访问 UES Agent</h1>
        <p className="mt-2 text-center text-sm leading-6 text-slate-500">
          请输入 Render 环境变量中的 APP_ACCESS_TOKEN。
        </p>
        <input
          type="password"
          value={token}
          onChange={event => setToken(event.target.value)}
          autoFocus
          autoComplete="current-password"
          placeholder="站点访问令牌"
          className="mt-5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400"
        />
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={!token || submitting}
          className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? '验证中…' : '进入网站'}
        </button>
      </form>
    </div>
  );
};
