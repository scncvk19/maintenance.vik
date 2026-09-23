'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PasswordInput from '../../components/password-input';

export default function SetupPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: data.get('username'),
          password: data.get('password'),
          password_repeat: data.get('password_repeat'),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || 'Einrichtung fehlgeschlagen.');
      router.replace('/'); router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="login-shell"><section className="panel login-card"><span className="eyebrow">MAINTENANCE.VIK</span><h1>Ersteinrichtung</h1><p>Lege das erste Administratorkonto an. Weitere Benutzer kannst du später in den Einstellungen verwalten.</p><form onSubmit={submit}><label>Administrator-Benutzername<input name="username" autoComplete="username" pattern="[A-Za-z0-9._-]{1,80}" maxLength={80} required autoFocus/></label><label>Passwort<PasswordInput name="password" autoComplete="new-password" minLength={12} maxLength={256} required/><small>Mindestens 12 Zeichen.</small></label><label>Passwort wiederholen<PasswordInput name="password_repeat" autoComplete="new-password" minLength={12} maxLength={256} required/></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Einrichtung …' : 'Einrichtung abschließen'}</button></form></section></main>;
}
