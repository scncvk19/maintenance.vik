'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, categories, json } from '../../lib/data';

type DocumentRow = { id: string; title: string; filename: string; category: string; sha256: string };
type Analysis = { text_preview: string; truncated: boolean; source: string; suggested_category: string | null; confidence: number; review_required: boolean; note: string };

export default function DocumentAnalysisPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selected, setSelected] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [choice, setChoice] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void api<DocumentRow[]>('records/documents').then(rows => {
      if (active) setDocuments(rows);
    }).catch(cause => { if (active) setError((cause as Error).message); });
    return () => { active = false; };
  }, []);
  async function analyze() {
    if (!selected) return;
    setBusy(true); setError(''); setMessage(''); setAnalysis(null); setChoice('');
    try {
      const result = await api<Analysis>(`documents/${selected}/analyze`, { method: 'POST' });
      setAnalysis(result); setChoice(result.suggested_category || '');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function confirmCategory() {
    const document = documents.find(row => row.id === selected);
    if (!document || !choice || !analysis) return;
    if (!window.confirm(`Dokumentkategorie ausdrücklich auf „${categories[choice]}“ ändern?`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api(`documents/${document.id}/confirm-category`, json('POST', {
        category: choice, expected_category: document.category, expected_sha256: document.sha256,
      }));
      setDocuments(rows => rows.map(row => row.id === document.id ? { ...row, category: choice } : row));
      setMessage(`Kategorie „${categories[choice]}“ wurde bestätigt und gespeichert.`);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 760, margin: '3rem auto', padding: '1.5rem', lineHeight: 1.6 }}>
    <Link href="/">← Zur Übersicht</Link>
    <h1>Dokumente lokal erkennen</h1>
    <p>Vorschau ohne Cloud: Text-PDFs, Scans, Bilder, TXT, CSV und DOCX. Bei PDFs werden höchstens die ersten drei Seiten untersucht. Vorschläge erst nach eigener Prüfung übernehmen.</p>
    <label htmlFor="analysis-document">Dokument auswählen</label><br />
    <select id="analysis-document" value={selected} onChange={event => { setSelected(event.target.value); setAnalysis(null); setChoice(''); setMessage(''); }} style={{ maxWidth: '100%', margin: '0.5rem 0' }}>
      <option value="">Bitte auswählen</option>
      {documents.map(document => <option key={document.id} value={document.id}>{document.title} · {document.filename}</option>)}
    </select><br />
    <button type="button" disabled={!selected || busy} onClick={() => void analyze()}>{busy ? 'Lokale Analyse läuft …' : 'Text lokal analysieren'}</button>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {analysis && <section style={{ marginTop: 20 }} aria-label="Analyseergebnis">
      <h2>Ergebnis</h2>
      <p>Quelle: {analysis.source}. Vorschlag: {analysis.suggested_category ? categories[analysis.suggested_category] : 'Keine eindeutige Kategorie'}.</p>
      <p>{analysis.note}</p>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: 16, border: '1px solid #888', borderRadius: 8 }}>{analysis.text_preview || 'Kein Text gefunden.'}{analysis.truncated ? '\n… [Vorschau gekürzt]' : ''}</pre>
      <label htmlFor="document-category">Kategorie nach eigener Prüfung wählen</label><br />
      <select id="document-category" value={choice} onChange={event => setChoice(event.target.value)}>
        <option value="">Keine Auswahl</option>
        {Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>{' '}
      <button type="button" onClick={() => void confirmCategory()} disabled={!choice || busy}>Kategorie bestätigen und speichern</button>
      <p>Die Originaldatei bleibt unverändert. Bei zwischenzeitlich geänderten Dokumenten wird das Speichern abgebrochen.</p>
    </section>}
  </main>;
}
