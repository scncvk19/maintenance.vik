'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: data.get('username'), password: data.get('password') }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Anmeldung fehlgeschlagen.');
      }
      location.href = '/';
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="login-shell"><section className="panel login-card"><span className="eyebrow">MAINTENANCE.VIK</span><h1>Anmelden</h1><p>Lokaler Zugang zu Assets, Wartungen, Finanzen und Dokumenten.</p><form onSubmit={submit}><label>Benutzername<input name="username" autoComplete="username" maxLength={80} required autoFocus/></label><label>Passwort<input name="password" type="password" autoComplete="current-password" maxLength={256} required/></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Anmeldung …' : 'Anmelden'}</button></form></section></main>;
}
