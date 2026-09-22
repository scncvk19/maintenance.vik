'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/data';

type Preview = {
  counts: { work_items: number; contracts: number; documents: number };
  telegram_recipients: number;
  configured: boolean;
  message: string;
  note: string;
};
type Delivery = { sent: number; already_sent: number };

export default function ReminderPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try { setPreview(await api<Preview>('notifications/preview')); setError(''); }
    catch (cause) { setError((cause as Error).message); }
  }
  useEffect(() => { void refresh(); }, []);
  async function send() {
    if (!preview || !preview.configured || !preview.telegram_recipients) return;
    if (!window.confirm('Jetzt eine Telegram-Nachricht mit den angezeigten Anzahlen an die aktiven Empfänger senden?')) return;
    setBusy(true); setError(''); setResult('');
    try {
      const response = await api<Delivery>('notifications/telegram/send', {
        method: 'POST', headers: { 'X-Confirm-Send': 'SEND_TELEGRAM' },
      });
      setResult(`${response.sent} Nachricht(en) versendet; ${response.already_sent} heute bereits gesendet.`);
      await refresh();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 720, margin: '3rem auto', padding: '1.5rem', lineHeight: 1.6 }}>
    <Link href="/">← Zurück zur Übersicht</Link>
    <h1>Erinnerungen &amp; Telegram</h1>
    <p>Lokale Vorschau. Es werden ausschließlich Anzahlen von fälligen Aufgaben, Verträgen und Dokumenten verschickt – keine Namen, Adressen, Beträge oder Steuerinhalte.</p>
    <button type="button" onClick={() => void refresh()} disabled={busy}>Vorschau aktualisieren</button>
    {preview && <section aria-label="Erinnerungsvorschau" style={{ marginTop: 20 }}>
      <p>Aktive Telegram-Empfänger: {preview.telegram_recipients}. Versand: {preview.configured ? 'bewusst freigeschaltet' : 'deaktiviert'}.</p>
      <pre style={{ whiteSpace: 'pre-wrap', padding: 16, border: '1px solid #888', borderRadius: 8 }}>{preview.message}</pre>
      <p>{preview.note}</p>
      <button type="button" onClick={() => void send()} disabled={busy || !preview.configured || !preview.telegram_recipients || !Object.values(preview.counts).some(Boolean)}>
        {busy ? 'Wird versendet …' : 'Telegram-Versand ausdrücklich bestätigen'}
      </button>
      {!preview.configured && <p>Zum Aktivieren einen eigenen Telegram-Bot in der lokalen `.env` konfigurieren und den Backend-Container neu erstellen. Keine Zugangsdaten in Chat oder Screenshots teilen.</p>}
    </section>}
    {error && <p role="alert">Fehler: {error}</p>}
    {result && <p role="status">{result}</p>}
  </main>;
}
