'use client';

import { useEffect, useRef, useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { api } from '../lib/data';

type SessionUser = { id?: string; username: string; role: 'admin' | 'viewer'; active?: boolean };

export default function ProfileMenu() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void api<SessionUser>('auth/session').then(value => { if (active) setUser(value); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  async function logout() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  }

  const initial = (user?.username || '?').trim().charAt(0).toLocaleUpperCase('de-DE') || '?';
  const role = user?.role === 'admin' ? 'Administrator' : 'Viewer';

  return <div className="profile-menu" ref={root}>
    <button
      className="avatar avatar-button"
      type="button"
      aria-label="Benutzermenü öffnen"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(value => !value)}
    >
      {initial}
    </button>
    {open && <div className="profile-popover" role="menu">
      <div className="profile-identity">
        <span className="profile-icon"><UserRound size={18}/></span>
        <div>
          <strong>{user?.username || 'Benutzer'}</strong>
          <small>{role}</small>
        </div>
      </div>
      <button className="profile-logout" role="menuitem" type="button" disabled={busy} onClick={logout}>
        <LogOut size={16}/>{busy ? 'Abmelden …' : 'Abmelden'}
      </button>
    </div>}
  </div>;
}
