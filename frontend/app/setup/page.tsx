'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';

export default function SetupPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
  return <main className="login-shell"><section className="panel login-card"><span className="eyebrow">MAINTENANCE.VIK</span><h1>Ersteinrichtung</h1><p>Lege das erste Administratorkonto an. Weitere Benutzer kannst du später in den Einstellungen verwalten.</p><form onSubmit={submit}><label>Administrator-Benutzername<input name="username" autoComplete="username" pattern="[A-Za-z0-9._-]{1,80}" maxLength={80} required autoFocus/></label><label>Passwort<div className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={256} required/><button type="button" className="password-toggle" aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div><small>Mindestens 12 Zeichen.</small></label><label>Passwort wiederholen<div className="password-field"><input name="password_repeat" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={256} required/><button type="button" className="password-toggle" aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Einrichtung …' : 'Einrichtung abschließen'}</button></form></section></main>;
}
