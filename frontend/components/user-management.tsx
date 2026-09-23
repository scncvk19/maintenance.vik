'use client';
import { useEffect, useState } from 'react';
import { api, json } from '../lib/data';
import PasswordInput from './password-input';

type User = { id: string; username: string; role: 'admin' | 'viewer'; active: boolean; created_at: string };
type Draft = User & { password?: string };

export default function UserManagement() {
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<Draft[]>([]);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function reload() {
    const current = await api<User>('auth/session');
    setMe(current);
    if (current.role === 'admin') setUsers(await api<User[]>('auth/users'));
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const current = await api<User>('auth/session');
        if (!active) return;
        setMe(current);
        if (current.role === 'admin') {
          const list = await api<User[]>('auth/users');
          if (active) setUsers(list);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    })();
    return () => { active = false; };
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api<User>('auth/users', json('POST', { username, role, password }));
      setUsername(''); setRole('viewer'); setPassword('');
      await reload(); setNotice('Benutzer wurde angelegt.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function save(user: Draft) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api<User>(`auth/users/${user.id}`, json('PUT', {
        username: user.username, role: user.role, active: user.active, password: user.password || '',
      }));
      await reload(); setNotice('Benutzer wurde aktualisiert.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function remove(user: Draft) {
    if (!window.confirm(`Benutzer „${user.username}“ wirklich löschen?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`auth/users/${user.id}`, { method: 'DELETE' });
      await reload(); setNotice('Benutzer wurde gelöscht.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (!me) return <section className="panel settings-panel"><h2>Benutzer</h2><p>Benutzerverwaltung wird geladen …</p></section>;
  if (me.role !== 'admin') return <section className="panel settings-panel"><h2>Benutzer</h2><p>Angemeldet als <strong>{me.username}</strong> (Viewer). Nur Administratoren dürfen Benutzer verwalten.</p></section>;

  return <section className="panel settings-panel user-management">
    <h2>Benutzerverwaltung</h2>
    <p>Lege Administratoren oder reine Leser an. Der letzte aktive Administrator kann nicht deaktiviert oder gelöscht werden.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="notice">{notice}</p>}
    <div className="user-list">
      {users.map((user, index) => <div className="user-row" key={user.id}>
        <input aria-label="Benutzername" value={user.username} disabled={busy} onChange={e => setUsers(rows => rows.map((row, i) => i === index ? {...row, username:e.target.value} : row))}/>
        <select aria-label="Rolle" value={user.role} disabled={busy} onChange={e => setUsers(rows => rows.map((row, i) => i === index ? {...row, role:e.target.value as 'admin'|'viewer'} : row))}><option value="admin">Administrator</option><option value="viewer">Viewer</option></select>
        <label className="check-field"><input type="checkbox" checked={user.active} disabled={busy} onChange={e => setUsers(rows => rows.map((row, i) => i === index ? {...row, active:e.target.checked} : row))}/>Aktiv</label>
        <PasswordInput aria-label="Neues Passwort" placeholder="Neues Passwort (optional)" minLength={12} disabled={busy} value={user.password || ''} onChange={e => setUsers(rows => rows.map((row, i) => i === index ? {...row, password:e.target.value} : row))}/>
        <button className="secondary" disabled={busy} onClick={() => save(user)}>Speichern</button>
        <button className="danger-button" disabled={busy || user.id === me.id} onClick={() => remove(user)}>Löschen</button>
      </div>)}
    </div>
    <hr/>
    <h3>Benutzer hinzufügen</h3>
    <form className="user-create" onSubmit={create}>
      <label>Benutzername<input value={username} pattern="[A-Za-z0-9._-]{1,80}" maxLength={80} required onChange={e => setUsername(e.target.value)}/></label>
      <label>Rolle<select value={role} onChange={e => setRole(e.target.value as 'admin'|'viewer')}><option value="viewer">Viewer</option><option value="admin">Administrator</option></select></label>
      <label>Passwort<PasswordInput value={password} minLength={12} maxLength={256} required onChange={e => setPassword(e.target.value)}/></label>
      <button className="primary" disabled={busy}>{busy ? 'Speichern …' : 'Benutzer hinzufügen'}</button>
    </form>
  </section>;
}
