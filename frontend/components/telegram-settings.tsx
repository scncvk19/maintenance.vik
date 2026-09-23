'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Send, Settings2 } from 'lucide-react';
import PasswordInput from './password-input';
import { api, json } from '../lib/data';

type TelegramSettingsState = {
  enabled: boolean;
  interval_seconds: number;
  token_configured: boolean;
  token_masked: string;
  source: 'ui' | 'env';
};

export default function TelegramSettings() {
  const [settings, setSettings] = useState<TelegramSettingsState | null>(null);
  const [token, setToken] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [interval, setInterval] = useState(3600);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await api<TelegramSettingsState>('notifications/telegram/settings');
        if (!active) return;
        setSettings(result);
        setEnabled(result.enabled);
        setInterval(result.interval_seconds);
      } catch (cause) {
        if (active) setError((cause as Error).message);
      }
    })();
    return () => { active = false; };
  }, []);

  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<TelegramSettingsState>('notifications/telegram/settings', json('PUT', {
        enabled,
        interval_seconds: interval,
        token: token.trim() || undefined,
      }));
      setSettings(result);
      setToken('');
      setMessage('Telegram-Einstellungen gespeichert.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<{ok: boolean; bot_username: string}>('notifications/telegram/test', json('POST', {
        token: token.trim() || undefined,
      }));
      setMessage(result.bot_username ? `Verbindung erfolgreich: @${result.bot_username}` : 'Telegram-Verbindung erfolgreich.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="telegram-settings">
    <div className="telegram-settings-head">
      <span><Settings2 size={18}/><strong>Bot-Konfiguration</strong></span>
      <span className={`badge ${settings?.token_configured ? 'open' : ''}`}>
        {settings?.token_configured ? 'Token vorhanden' : 'Nicht eingerichtet'}
      </span>
    </div>
    <p>Der Bot-Token wird verschlüsselt im lokalen Datenvolume gespeichert und nie wieder im Klartext angezeigt.</p>

    <label>Bot-Token
      <PasswordInput
        value={token}
        onChange={event => setToken(event.target.value)}
        autoComplete="off"
        placeholder={settings?.token_configured ? '••••••••••••  – neuen Token nur bei Änderung eingeben' : 'Telegram Bot-Token eingeben'}
        disabled={busy}
      />
    </label>

    <div className="telegram-settings-row">
      <label className="check-field">
        <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={busy}/>
        Telegram-Erinnerungen aktivieren
      </label>
      <label>Automatisch prüfen
        <select value={interval} onChange={event => setInterval(Number(event.target.value))} disabled={busy}>
          <option value={900}>Alle 15 Minuten</option>
          <option value={1800}>Alle 30 Minuten</option>
          <option value={3600}>Stündlich</option>
          <option value={21600}>Alle 6 Stunden</option>
          <option value={86400}>Täglich</option>
        </select>
      </label>
    </div>

    <div className="record-links">
      <button className="secondary" type="button" disabled={busy || (!token.trim() && !settings?.token_configured)} onClick={testConnection}><Send size={16}/>Verbindung testen</button>
      <button className="primary" type="button" disabled={busy} onClick={save}><CheckCircle2 size={16}/>Einstellungen speichern</button>
    </div>
    {settings?.source === 'env' && settings.token_configured && <small>Bestehende .env-Konfiguration erkannt. Mit „Einstellungen speichern“ wird sie in die UI-Verwaltung übernommen.</small>}
    {message && <div className="notice compact" role="status">{message}</div>}
    {error && <div className="error compact" role="alert">{error}</div>}
  </div>;
}
