'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  async function login() {
    setError('');
    if (!username || !password) { setError('Username and password are required.'); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (r.ok) { router.push('/'); return; }
      const d = await r.json().catch(() => ({}));
      setError(d.error || 'Invalid username or password.');
    } catch {
      setError('Connection error. Please try again.');
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="w-[360px] bg-surface border border-border rounded-card p-10">
        <h1 className="text-xl font-semibold text-text mb-1">Octopus Media</h1>
        <p className="text-muted text-sm mb-7">Sign in with your OctopusTechnology account</p>

        <label className="block text-xs text-muted mb-1.5">Username</label>
        <input
          className="w-full bg-bg border border-border rounded-md text-text text-sm px-3 py-2.5 mb-4 outline-none focus:border-accent"
          type="text" autoFocus autoComplete="username"
          value={username} onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
        />

        <label className="block text-xs text-muted mb-1.5">Password</label>
        <input
          className="w-full bg-bg border border-border rounded-md text-text text-sm px-3 py-2.5 mb-4 outline-none focus:border-accent"
          type="password" autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
        />

        <button
          onClick={login} disabled={loading}
          className="w-full bg-accent hover:bg-accent-h disabled:opacity-60 text-bg font-semibold text-sm py-2.5 rounded-md mt-1 transition-colors"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        {error && (
          <div className="mt-4 px-3 py-2.5 bg-[#3d1f1f] border border-[#6e2424] rounded-md text-[#f85149] text-xs">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
