'use client';

import { useEffect } from 'react';

export default function LoginPage() {
  useEffect(() => {
    const returnUrl = encodeURIComponent(window.location.origin + '/');
    window.location.href = `https://auth.octopustechnology.net/login?redirect=${returnUrl}`;
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <p className="text-muted text-sm">Redirecting to sign in…</p>
    </div>
  );
}
