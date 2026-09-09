'use client';

import { useEffect, useState } from 'react';
import { Check, Download, Eye, FileText, KeyRound, Lock, Plus, Printer, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { api } from '../lib/data';

type Attachment = { id: string; filename: string; content_type: string };
type ChecklistItem = { label: string; done: boolean };
type Checklist = { id: string; title: string; items: ChecklistItem[] };
type TaxCase = { id: string; name: string; year: string; status: string; due_date: string; tax_id: string; tax_number: string; notes: string; checklists: Checklist[]; attachments: Attachment[] };

const templateItems = ['Lohnsteuerbescheinigung', 'Versicherungen und Vorsorge', 'Handwerker und haushaltsnahe Dienstleistungen', 'Kinderbetreuung und Schulgeld', 'Spenden', 'Krankheitskosten', 'Renten- oder Leistungsmitteilungen', 'Weitere Belege und Besonderheiten'];
const headers = (token: string) => ({ 'X-Tax-Session': token });
const emptyDraft = () => ({ name: '', year: String(new Date().getFullYear()), tax_id: '', tax_number: '', due_date: '', notes: '' });
const initialChecklists = (): Checklist[] => [{ id: 'unterlagen', title: 'Unterlagen-Checkliste', items: templateItems.map(label => ({ label, done: false })) }];

function printPage(title: string, content: string) {
  const popup = window.open('', '_blank', 'width=800,height=900');
  if (!popup) return;
  popup.document.write(`<html><head><title>${title}</title><style>body{font:14px Arial;color:#172019;padding:36px;line-height:1.45}h1{font-size:25px;margin:0 0 8px}.meta{margin:0 0 22px;color:#536156}.item{padding:12px 0;border-bottom:1px solid #d7ded8}.box{display:inline-block;width:16px;height:16px;border:1px solid #58665f;margin-right:10px;vertical-align:-3px}.key{display:block;margin:22px 0;padding:16px;border:1px dashed #547046;background:#f2f5ed;font:700 16px monospace;letter-spacing:1px;word-break:break-all}@page{margin:14mm}</style></head><body>${content}</body></html>`);
  popup.document.close();
  window.setTimeout(() => { popup.focus(); popup.print(); }, 200);
}

export default function TaxCenter() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [eraseMode, setEraseMode] = useState(false);
  const [eraseConfirmation, setEraseConfirmation] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [cases, setCases] = useState<TaxCase[]>([]);
  const [selected, setSelected] = useState<TaxCase | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [newCase, setNewCase] = useState(false);
  const [newChecklist, setNewChecklist] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api<{ configured: boolean; recovery_ready: boolean }>('tax-vault/status')
      .then(value => { setConfigured(value.configured); setRecoveryReady(value.recovery_ready); })
      .catch(reason => setError(reason.message));
  }, []);

  useEffect(() => {
    if (!token) return;
    let timer: ReturnType<typeof setTimeout>;
    let lastTouch = 0;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => lock('Der Steuerbereich wurde nach 15 Minuten Inaktivität gesperrt.'), 900000);
      if (Date.now() - lastTouch > 60000) {
        lastTouch = Date.now();
        api('tax-vault/touch', { method: 'POST', headers: headers(token) }).catch(() => lock('Der Steuerbereich wurde gesperrt.'));
      }
    };
    const lock = (message = '') => { setToken(''); setCases([]); setSelected(null); if (message) setNotice(message); };
    window.addEventListener('pointerdown', refresh);
    window.addEventListener('keydown', refresh);
    refresh();
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', refresh); window.removeEventListener('keydown', refresh); };
  }, [token]);

  async function loadCases(nextToken: string) {
    setCases(await api<TaxCase[]>('tax-cases', { headers: headers(nextToken) }));
  }

  async function unlock(setup: boolean) {
    setBusy(true); setError('');
    try {
      const result = await api<{ token: string; recovery_code?: string }>(setup ? 'tax-vault/setup' : 'tax-vault/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      setToken(result.token); setPassword(''); setConfigured(true);
      if (result.recovery_code) { setRecoveryCode(result.recovery_code); setRecoveryReady(true); }
      await loadCases(result.token); setNotice('Steuerbereich entsperrt.');
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }

  async function recoverPassword() {
    setBusy(true); setError('');
    try {
      const result = await api<{ token: string }>('tax-vault/recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recovery_code: recoveryInput, password }) });
      setToken(result.token); setPassword(''); setRecoveryInput(''); setRecoveryMode(false);
      await loadCases(result.token); setNotice('Neues Steuerpasswort gesetzt.');
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }

  async function createRecoveryCode() {
    setBusy(true); setError('');
    try {
      const result = await api<{ recovery_code: string }>('tax-vault/recovery-code', { method: 'POST', headers: headers(token) });
      setRecoveryCode(result.recovery_code); setRecoveryReady(true);
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }

  async function eraseTaxData() {
    setBusy(true); setError('');
    try {
      await api('tax-vault/erase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: eraseConfirmation }) });
      setConfigured(false); setRecoveryReady(false); setEraseMode(false); setEraseConfirmation(''); setPassword('');
      setNotice('Der bisherige Steuerbereich wurde gelöscht. Lege jetzt ein neues Steuerpasswort fest.');
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }

  async function saveCase() {
    setBusy(true); setError('');
    try {
      const item = await api<TaxCase>('tax-cases', { method: 'POST', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, checklists: initialChecklists() }) });
      setCases(value => [item, ...value]); setSelected(item); setDraft(emptyDraft()); setNewCase(false); setNotice('Steuerfall angelegt.');
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }

  async function updateCase(patch: Partial<TaxCase>) {
    if (!selected) return;
    try {
      const item = await api<TaxCase>(`tax-cases/${selected.id}`, { method: 'PUT', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      setSelected(item); setCases(value => value.map(row => row.id === item.id ? item : row));
    } catch (reason) { setError((reason as Error).message); }
  }

  async function deleteCase() {
    if (!selected || !window.confirm(`Steuerfall „${selected.name}“ mit allen verschlüsselten Unterlagen endgültig löschen?`)) return;
    setBusy(true); setError('');
    try {
      await api(`tax-cases/${selected.id}`, { method: 'DELETE', headers: headers(token) });
      setCases(value => value.filter(item => item.id !== selected.id)); setSelected(null);
      setNotice('Steuerfall und zugehörige Unterlagen gelöscht.');
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }

  async function deleteAttachment(file: Attachment) {
    if (!selected || !window.confirm(`Die Datei „${file.filename}“ endgültig löschen?`)) return;
    setBusy(true); setError('');
    try {
      await api(`tax-cases/${selected.id}/attachments/${file.id}`, { method: 'DELETE', headers: headers(token) });
      const attachments = selected.attachments.filter(item => item.id !== file.id);
      const updated = { ...selected, attachments };
      setSelected(updated); setCases(value => value.map(item => item.id === updated.id ? updated : item));
      setNotice('Upload gelöscht.');
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selected) return;
    setBusy(true); setError('');
    try {
      const body = new FormData(); body.set('file', file);
      await api(`tax-cases/${selected.id}/attachments`, { method: 'POST', headers: headers(token), body });
      await loadCases(token); setNotice('Dokument verschlüsselt abgelegt.');
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); event.target.value = ''; }
  }

  async function previewAttachment(file: Attachment) {
    const previewable = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv'];
    if (!selected || !previewable.includes(file.content_type)) {
      setNotice('Dieser Dateityp kann nicht direkt angezeigt werden. Bitte herunterladen.');
      return;
    }
    const popup = window.open('', '_blank');
    if (!popup) { setError('Die Vorschau wurde vom Browser blockiert.'); return; }
    try {
      const response = await fetch(`/api/tax-cases/${selected.id}/attachments/${file.id}`, { headers: headers(token) });
      if (!response.ok) throw new Error('Die Vorschau konnte nicht geladen werden.');
      const url = URL.createObjectURL(await response.blob());
      popup.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (reason) { popup.close(); setError((reason as Error).message); }
  }

  function addChecklist() {
    if (!selected || !newChecklist.trim()) return;
    const mainChecklist = selected.checklists.find(list => list.id === 'unterlagen') || selected.checklists[0];
    const checklists = mainChecklist
      ? selected.checklists.map(list => list.id === mainChecklist.id ? { ...list, items: [...list.items, { label: newChecklist.trim(), done: false }] } : list)
      : [{ id: 'unterlagen', title: 'Unterlagen-Checkliste', items: [{ label: newChecklist.trim(), done: false }] }];
    setSelected({ ...selected, checklists }); setNewChecklist(''); updateCase({ checklists });
  }

  function toggleChecklistItem(list: Checklist, index: number) {
    if (!selected) return;
    const checklists = selected.checklists.map(current => current.id === list.id ? { ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, done: !item.done } : item) } : current);
    setSelected({ ...selected, checklists }); updateCase({ checklists });
  }

  function editChecklist(listId: string, change: (list: Checklist) => Checklist) {
    if (!selected) return;
    const checklists = selected.checklists.map(list => list.id === listId ? change(list) : list);
    setSelected({ ...selected, checklists });
  }

  function saveChecklists() {
    if (selected) updateCase({ checklists: selected.checklists });
  }

  function saveChecklistTitle(listId: string) {
    if (!selected) return;
    const checklists = selected.checklists.map(list => list.id === listId ? { ...list, title: list.title.trim() || 'Unterlagen-Checkliste' } : list);
    setSelected({ ...selected, checklists }); updateCase({ checklists });
  }

  function removeChecklistItem(list: Checklist, index: number) {
    if (!selected || !window.confirm(`Den Punkt „${list.items[index].label}“ aus der Checkliste entfernen?`)) return;
    const checklists = selected.checklists.map(current => current.id === list.id ? { ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) } : current);
    setSelected({ ...selected, checklists }); updateCase({ checklists });
  }

  if (configured === null) return <div className="empty panel">Steuerbereich wird vorbereitet …</div>;
  if (!token) return <section className="tax-lock panel">
    <ShieldCheck size={34}/><h2>{configured ? (recoveryMode ? 'Passwort wiederherstellen' : 'Steuerfälle geschützt') : 'Steuerbereich einrichten'}</h2>
    <p>{recoveryMode ? 'Nutze deinen gedruckten Wiederherstellungsschlüssel und vergib ein neues Passwort.' : configured ? 'Gib das bei der Einrichtung festgelegte Steuerpasswort ein.' : 'Lege ein persönliches Steuerpasswort fest.'}</p>
    {recoveryMode && <label>Wiederherstellungsschlüssel<input value={recoveryInput} onChange={event => setRecoveryInput(event.target.value)} autoComplete="off"/></label>}
    <label>{configured && !recoveryMode ? 'Steuerpasswort' : 'Neues Steuerpasswort'}<input type="password" value={password} onChange={event => { setPassword(event.target.value); setError(''); }} minLength={8}/></label>
    <button className="primary" disabled={busy || password.length < 8 || (recoveryMode && !recoveryInput)} onClick={() => recoveryMode ? recoverPassword() : unlock(!configured)}><Lock size={17}/>{recoveryMode ? 'Neues Passwort setzen' : configured ? 'Steuerfälle entsperren' : 'Steuerbereich einrichten'}</button>
    {configured && <button className="text-button" onClick={() => { setRecoveryMode(value => !value); setEraseMode(false); setError(''); }}>Passwort vergessen?</button>}
    {configured && <button className="text-button danger" disabled={busy} onClick={() => { setEraseMode(value => !value); setRecoveryMode(false); setError(''); }}>Neuen Steuerbereich anlegen</button>}
    {eraseMode && <div className="error" style={{ display: 'grid', justifyItems: 'stretch', textAlign: 'left' }}><strong>Neuen Steuerbereich anlegen?</strong><span>Das ist auch bei vorhandenen Steuerfällen möglich. Der bisherige Bereich mit allen Steuerfällen, Steuer-IDs, Notizen und verschlüsselten Uploads wird unwiderruflich gelöscht. Zur Bestätigung bitte <b>STEUERDATEN LÖSCHEN</b> eingeben.</span><input value={eraseConfirmation} onChange={event => setEraseConfirmation(event.target.value)} placeholder="STEUERDATEN LÖSCHEN"/><button className="danger-button" disabled={busy || eraseConfirmation !== 'STEUERDATEN LÖSCHEN'} onClick={eraseTaxData}>Bisherigen Bereich löschen und neuen anlegen</button></div>}
    {error ? <div className="error">{error}</div> : notice && <div className="notice">{notice}</div>}
  </section>;

  return <div className="tax-center">
    <div className="tax-toolbar"><div><span className="eyebrow">GESCHÜTZTER BEREICH</span><h2>Steuerfälle</h2><p>Entsperrt · automatische Sperre nach 15 Minuten Inaktivität</p></div><div><button className="secondary" onClick={() => { setToken(''); setCases([]); setSelected(null); }}><Lock size={16}/>Sperren</button><button className="primary" onClick={() => setNewCase(true)}><Plus size={16}/>Steuerfall anlegen</button></div></div>
    {error && <div className="error">{error}</div>}{notice && <div className="notice"><Check size={17}/>{notice}</div>}
    {recoveryCode && <section className="recovery-code panel"><KeyRound size={22}/><div><h3>Wiederherstellungsschlüssel sichern</h3><p>Diesen Schlüssel jetzt ausdrucken oder sicher notieren. Er wird nie wieder angezeigt.</p><code>{recoveryCode}</code></div><button className="secondary" onClick={() => printPage('Wiederherstellungsschlüssel', `<h1>Wiederherstellungsschlüssel</h1><p class="meta">maintenance.vik · Steuerfälle</p><p>Bewahre diesen Schlüssel getrennt vom Steuerpasswort an einem sicheren Ort auf.</p><code class="key">${recoveryCode}</code>`)}><Printer size={16}/>Drucken</button><button className="icon-button" onClick={() => setRecoveryCode('')} aria-label="Schlüssel ausgeblendet"><X size={18}/></button></section>}
    {!recoveryReady && <button className="secondary" onClick={createRecoveryCode} disabled={busy}><KeyRound size={16}/>Wiederherstellungsschlüssel erstellen</button>}
    <div className="tax-layout"><div className="tax-case-list">{cases.map(item => <button className={selected?.id === item.id ? 'selected' : ''} key={item.id} onClick={() => setSelected(item)}><FileText size={18}/><span><strong>{item.name}</strong><small>{item.year} · {item.status === 'done' ? 'Abgeschlossen' : 'In Bearbeitung'}</small></span></button>)}{!cases.length && <div className="empty compact"><FileText/><p>Noch keine Steuerfälle angelegt.</p></div>}</div>
      {selected && <section className="tax-case panel"><div className="panel-heading"><div><span className="eyebrow">STEUERFALL</span><h2>{selected.name}</h2><p>Steuerjahr {selected.year}</p></div><div><button className="icon-button danger" onClick={deleteCase} disabled={busy} aria-label="Steuerfall löschen"><Trash2 size={18}/></button><button className="icon-button" onClick={() => setSelected(null)} aria-label="Steuerfall schließen"><X size={18}/></button></div></div>
        <div className="tax-fields"><label>Name / Familie<input value={selected.name} onChange={event => setSelected({ ...selected, name: event.target.value })} onBlur={() => updateCase({ name: selected.name.trim() })}/></label><label>Steuerjahr<input type="number" min="2000" max="2100" value={selected.year} onChange={event => setSelected({ ...selected, year: event.target.value })} onBlur={() => updateCase({ year: selected.year })}/></label><label>Status<select value={selected.status} onChange={event => { const status = event.target.value; setSelected({ ...selected, status }); updateCase({ status }); }}><option value="open">In Bearbeitung</option><option value="done">Abgeschlossen</option></select></label><label>Steuer-ID<input value={selected.tax_id} onChange={event => setSelected({ ...selected, tax_id: event.target.value })} onBlur={() => updateCase({ tax_id: selected.tax_id })}/></label><label>Steuernummer<input value={selected.tax_number} onChange={event => setSelected({ ...selected, tax_number: event.target.value })} onBlur={() => updateCase({ tax_number: selected.tax_number })}/></label><label>Abgabefrist<input type="date" value={selected.due_date || ''} onChange={event => setSelected({ ...selected, due_date: event.target.value })} onBlur={() => updateCase({ due_date: selected.due_date })}/></label></div>
        <label>Notizen<textarea rows={4} value={selected.notes} onChange={event => setSelected({ ...selected, notes: event.target.value })} onBlur={() => updateCase({ notes: selected.notes })}/></label>
        <div className="tax-section"><div className="panel-heading"><h3>Unterlagen-Checkliste</h3><div><input aria-label="Weiteren Checklistenpunkt hinzufügen" placeholder="Weiteren Punkt hinzufügen, z. B. Arbeitsmittel" value={newChecklist} onChange={event => setNewChecklist(event.target.value)}/><button className="secondary" onClick={addChecklist} disabled={!newChecklist.trim()}><Plus size={16}/>Hinzufügen</button></div></div>{selected.checklists.map(list => <section className="checklist-card" key={list.id}><div className="panel-heading"><h4><input aria-label="Titel der Checkliste" value={list.title} onChange={event => editChecklist(list.id, current => ({ ...current, title: event.target.value }))} onBlur={() => saveChecklistTitle(list.id)}/></h4><button className="secondary" onClick={() => printPage(list.title, `<h1>${list.title}</h1><p class="meta">Steuerfall: <b>${selected.name}</b> · Steuerjahr: <b>${selected.year}</b></p>${list.items.map(entry => `<div class="item"><span class="box">${entry.done ? '✓' : ''}</span>${entry.label}</div>`).join('')}`)}><Printer size={16}/>Drucken</button></div>{list.items.length ? list.items.map((entry, index) => <div className="check-field checklist-editor" key={`${entry.label}-${index}`}><input type="checkbox" checked={entry.done} onChange={() => toggleChecklistItem(list, index)}/><input aria-label="Checklistenpunkt" value={entry.label} onChange={event => editChecklist(list.id, current => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) }))} onBlur={saveChecklists}/><button className="icon-button danger" onClick={() => removeChecklistItem(list, index)} aria-label="Checklistenpunkt entfernen"><Trash2 size={16}/></button></div>) : <p>Noch keine Punkte angelegt.</p>}</section>)}</div>
        <div className="tax-section"><div className="panel-heading"><h3>Verschlüsselte Unterlagen</h3><label className="secondary"><Upload size={16}/>Datei hinzufügen<input type="file" hidden onChange={upload}/></label></div>{selected.attachments.map(file => <div className="record-links" key={file.id}><button className="record-link" onClick={() => previewAttachment(file)}><Eye size={14}/>Vorschau</button><a className="record-link" href={`/api/tax-cases/${selected.id}/attachments/${file.id}`} onClick={async event => { event.preventDefault(); const response = await fetch(`/api/tax-cases/${selected.id}/attachments/${file.id}`, { headers: headers(token) }); const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = file.filename; link.click(); URL.revokeObjectURL(url); }}><Download size={14}/>{file.filename}</a><button className="record-link danger" onClick={() => deleteAttachment(file)} disabled={busy}><Trash2 size={14}/>Löschen</button></div>)}{!selected.attachments.length && <p>Noch keine Unterlagen hochgeladen.</p>}</div>
      </section>}
      {newCase && <section className="tax-case panel"><div className="panel-heading"><h2>Neuen Steuerfall anlegen</h2><button className="icon-button" onClick={() => setNewCase(false)} aria-label="Abbrechen"><X size={18}/></button></div><label>Name / Familie<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label><label>Steuerjahr<input type="number" value={draft.year} onChange={event => setDraft({ ...draft, year: event.target.value })}/></label><div className="tax-actions"><button className="secondary" onClick={() => setNewCase(false)}>Abbrechen</button><button className="primary" disabled={busy || !draft.name.trim()} onClick={saveCase}>Speichern</button></div></section>}
    </div>
  </div>;
}
