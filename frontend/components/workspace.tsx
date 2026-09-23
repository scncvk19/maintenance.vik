'use client';
import Image from 'next/image';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Bell, Building2, CalendarDays, CarFront, Check, ChevronRight, CircleDollarSign, DoorOpen, Download, Eye, Factory, FileText, LandPlot, LayoutDashboard, Layers3, MapPinned, Menu, Pencil, Plus, Search, Settings2, ShieldCheck, Trash2, Upload, Wrench, X } from 'lucide-react';
import Editor from './editor';
import AssetDetail from './asset-detail';
import TaxCenter from './tax-center';
import UserManagement from './user-management';
import ProfileMenu from './profile-menu';
import FinanceOverview from './finance-overview';
import TelegramSettings from './telegram-settings';
import { api, billingCycles, categories, conditions, Dashboard, day, getSystemCondition, json, kinds, money, Row, statuses, today, transactionCategories, workKinds } from '../lib/data';

const nav = [
  ['dashboard', 'Übersicht', LayoutDashboard], ['properties', 'Immobilien', Building2], ['vehicles', 'Fahrzeuge', CarFront], ['finance', 'Finanzen', CircleDollarSign], ['tax', 'Steuerfälle', FileText], ['tasks', 'Aufgaben & Termine', Check],
  ['documents', 'Dokumente', FileText], ['settings', 'Einstellungen & Backup', Settings2],
] as const;
type Section = typeof nav[number][0] | 'assets' | 'components' | 'contracts' | 'maintenance' | 'transactions' | 'reminders';
type DependencyInfo = { total: number; groups: Record<string, Row[]> };
const descriptions: Record<Section, string> = {
  dashboard: 'Dein Bestand. Deine Termine. Alles an einem Ort.', assets: 'Bestand zentral verwalten.', properties: 'Immobilie auswählen und alle Informationen zentral verwalten.', vehicles: 'Fahrzeuge, Kosten, Termine und Dokumente verwalten.', finance: 'Einnahmen, Ausgaben und laufende Verträge nach Asset und Standort im Blick.', tax: 'Steuerfälle planen, Unterlagen sammeln und Fristen im Blick behalten.',
  components: 'Die Details deines Bestands – vom Raum bis zum Bauteil.', contracts: 'Wiederkehrende Zahlungen, Laufzeiten und Kündigungsfristen im Blick.', maintenance: 'Vorausschauend planen und durchgeführte Arbeiten nachvollziehen.',
  tasks: 'Aufgaben, Mängel, Wartungen und Steuererklärungen gemeinsam planen.', transactions: 'Einnahmen und Ausgaben übersichtlich erfassen. Alle Beträge in EUR.',
  documents: 'Unterlagen nach Asset, Monat und Kategorie organisieren.', reminders: 'Überfälliges und Termine der nächsten 30 Tage.', settings: 'Deine Daten sichern und die Anwendung anpassen.',
};

async function loadWorkspace() {
    const names = ['assets', 'components', 'work-items', 'transactions', 'documents', 'contracts', 'notification-recipients'];
  const [results, dashboard, reminders, trash, activity] = await Promise.all([
    Promise.all(names.map(n => api<Row[]>(`records/${n}`))),
    api<Dashboard>('dashboard'), api<Row[]>('reminders'), api<Row[]>('trash'), api<Row[]>('activity')
  ]);
  return { rows: Object.fromEntries([...names.map((n, i) => [n, results[i]]), ['reminders', reminders], ['trash', trash], ['activity', activity]]), dashboard };
}
function subscribeTheme(callback: () => void) { window.addEventListener('storage', callback); return () => window.removeEventListener('storage', callback); }
function getTheme() { const value = localStorage.getItem('maintenance-theme'); return value && ['light', 'dark'].includes(value) ? value : 'light'; }
function setTheme(value: string) { localStorage.setItem('maintenance-theme', value); window.dispatchEvent(new Event('storage')); }

function AssetGallery({ assets, allAssets, workItems, onOpen, onEdit, onDelete }: { assets: Row[]; allAssets: Row[]; workItems: Row[]; onOpen: (row: Row) => void; onEdit: (row: Row) => void; onDelete: (row: Row) => void }) {
  const nextMaintenance = (assetId: string) => workItems
    .filter(row => row.asset_id === assetId && row.kind === 'maintenance' && row.status !== 'done')
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];
  return <div className="asset-gallery" aria-label="Visuelle Asset-Übersicht">
    {assets.map(row => {
      const maintenance = nextMaintenance(String(row.id));
      const system = getSystemCondition(row.id, workItems);
      const Icon = row.kind === 'building' ? Building2 : row.kind === 'vehicle' ? CarFront : row.kind === 'property' ? LandPlot : Factory;
      return <article className="visual-asset-card" key={row.id}>
        <button className={`visual-asset-art ${row.kind} ${row.cover_document_id ? 'has-image' : ''}`} onClick={() => onOpen(row)} aria-label={`${row.name} öffnen`}>{row.cover_document_id ? <Image src={`/api/assets/${row.id}/image`} alt="" fill unoptimized sizes="(max-width: 850px) 100vw, 50vw"/> : <Icon size={58}/>}<span>{kinds[String(row.kind)]}</span></button>
        <div className="visual-asset-content"><div className="visual-asset-title"><div><h2>{row.name}</h2><p>{row.location || 'Kein Standort hinterlegt'}</p>{row.kind === 'vehicle' && row.property_id && <small>Immobilie: {allAssets.find(asset => asset.id === row.property_id)?.name || 'Zuordnung'}</small>}</div><div className="asset-status-stack"><span className={`badge ${String(row.condition)}`}>Manuell: {conditions[String(row.condition)]}</span><span className={`badge ${system.key}`} title={system.reason}>System: {conditions[system.key]}</span></div></div>
          <div className="visual-asset-meta"><span><small>NÄCHSTE WARTUNG</small><strong>{maintenance?.due_date ? day(maintenance.due_date) : 'Keine geplant'}</strong></span><span><small>AUFGABEN</small><strong>{workItems.filter(item => item.asset_id === row.id && item.status !== 'done').length}</strong></span></div>
          <div className="visual-asset-actions"><button className="secondary" onClick={() => onOpen(row)}>Details öffnen</button><button className="icon-button" onClick={() => onEdit(row)} aria-label={`${row.name} bearbeiten`}><Pencil size={16}/></button><button className="icon-button danger" onClick={() => onDelete(row)} aria-label={`${row.name} löschen`}><Trash2 size={16}/></button></div>
        </div>
      </article>;
    })}
  </div>;
}

function ComponentGallery({ components, assetName, onEdit, onDelete }: { components: Row[]; assetName: (id: string | number | null) => string; onEdit: (row: Row) => void; onDelete: (row: Row) => void }) {
  const labels = { room: 'Raum', floor: 'Etage', area: 'Bereich', component: 'Komponente' } as Record<string, string>;
  return <div className="component-gallery" aria-label="Räume und Komponenten">
    {components.map(item => {
      const Icon = item.kind === 'room' ? DoorOpen : item.kind === 'floor' ? Layers3 : item.kind === 'area' ? MapPinned : Wrench;
      return <article className={`component-card ${item.kind}`} key={item.id}>
        <span className="component-icon"><Icon size={26}/></span>
        <div className="component-card-content"><span className="badge open">{labels[String(item.kind)]}</span><h2>{item.name}</h2><p>{assetName(item.asset_id)}</p>{item.notes && <small>{String(item.notes).slice(0, 120)}</small>}</div>
        <div className="component-card-actions"><button className="icon-button" aria-label={`${item.name} bearbeiten`} onClick={() => onEdit(item)}><Pencil size={16}/></button><button className="icon-button danger" aria-label={`${item.name} löschen`} onClick={() => onDelete(item)}><Trash2 size={16}/></button></div>
      </article>;
    })}
  </div>;
}

function WorkItemGallery({ items, assetName, componentName, onEdit, onDelete }: { items: Row[]; assetName: (id: string | number | null) => string; componentName: (id: string | number | null) => string; onEdit: (row: Row) => void; onDelete: (row: Row) => void }) {
  const priorityLabel: Record<string, string> = { low: 'Niedrig', normal: 'Normal', high: 'Hoch', critical: 'Kritisch', urgent: 'Kritisch' };
  return <div className="work-item-gallery" aria-label="Wartungen und Aufgaben">
    {items.map(item => {
      const overdue = String(item.due_date) < today();
      return <article className={`work-item-card ${overdue ? 'overdue' : ''}`} key={item.id}>
        <span className="work-date"><b>{String(item.due_date).slice(8)}</b><small>{new Date(`${item.due_date}T12:00:00`).toLocaleDateString('de-DE', { month: 'short' })}</small></span>
        <div className="work-item-content"><div className="work-badges"><span className={`badge ${overdue ? 'critical' : String(item.status)}`}>{overdue ? 'Überfällig' : statuses[String(item.status)]}</span>{item.kind !== 'maintenance' && <span className={`badge priority-${String(item.priority || 'normal')}`}>{priorityLabel[String(item.priority || 'normal')]}</span>}</div><h2>{item.title}</h2><p>{assetName(item.asset_id)}{item.component_id ? ` · ${componentName(item.component_id)}` : ''}</p><small>{workKinds[String(item.kind)]}{item.interval_days ? ` · alle ${item.interval_days} Tage` : ''}</small>{item.notes && <p className="work-notes">{String(item.notes).slice(0, 120)}</p>}</div>
        <div className="work-item-actions"><button className="icon-button" aria-label={`${item.title} bearbeiten`} onClick={() => onEdit(item)}><Pencil size={16}/></button><button className="icon-button danger" aria-label={`${item.title} löschen`} onClick={() => onDelete(item)}><Trash2 size={16}/></button></div>
      </article>;
    })}
  </div>;
}

function RecordGallery({ section, records, documents, assetName, onEdit, onDelete, onAnalyze }: { section: 'contracts' | 'transactions' | 'documents' | 'reminders'; records: Row[]; documents: Row[]; assetName: (id: string | number | null) => string; onEdit: (row: Row) => void; onDelete: (row: Row) => void; onAnalyze?: (row: Row) => void }) {
  const config = section === 'contracts' ? { icon: FileText, label: 'Vertrag' } : section === 'transactions' ? { icon: CircleDollarSign, label: 'Finanzeintrag' } : section === 'documents' ? { icon: FileText, label: 'Dokument' } : { icon: Bell, label: 'Erinnerung' };
  const Icon = config.icon;
  return <div className={`record-gallery ${section}`} aria-label={`${config.label}e`}>
    {records.map(row => {
      const linkedDocument = documents.find(document => document.id === row.document_id);
      const reminderIsContract = row.reminder_type === 'contract';
      const title = String(row.name || row.title || row.filename || config.label);
      const category = section === 'documents' ? categories[String(row.category)] : section === 'transactions' ? transactionCategories[String(row.category)] : section === 'contracts' ? 'Wiederkehrende Zahlung' : reminderIsContract ? 'Vertrag endet' : row.reminder_type === 'document' ? 'Dokumentfrist' : 'Fälliger Eintrag';
      const details = section === 'contracts' ? <><strong>{money(Number(row.amount_cents))} / {billingCycles[String(row.billing_cycle)]}</strong><small>{day(row.start_date)} – {day(row.end_date)} · Erinnerung {row.reminder_days} Tage vorher</small></> : section === 'transactions' ? <><strong className={row.direction === 'income' ? 'positive' : 'negative'}>{row.direction === 'income' ? '+' : '−'}{money(Number(row.amount_cents))}</strong><small>{day(row.booked_date)}</small></> : section === 'documents' ? <><strong>{day(row.document_date)}</strong><small>{row.analysis_status === 'suggested' ? 'Automatisch zugeordnet – bitte prüfen' : 'Manuell geprüft'}</small></> : <><strong>{day(row.due_date || row.end_date || row.reminder_date)}</strong><small>{reminderIsContract ? `in ${row.days_until_end} Tagen` : row.reminder_type === 'document' ? `in ${row.days_until_reminder} Tagen` : assetName(row.asset_id)}</small></>;
      const editResource = section === 'reminders' && reminderIsContract ? 'contracts' : section === 'reminders' && row.reminder_type === 'document' ? 'documents' : section;
      return <article className="record-card" key={`${row.reminder_type || section}-${row.id}`}>
        <span className="record-icon"><Icon size={22}/></span>
        <div className="record-content"><span className="badge open">{category}</span><h2>{title}</h2><p>{section === 'contracts' ? `${row.provider || 'Kein Anbieter'} · ${assetName(row.asset_id)}` : section === 'documents' ? `${assetName(row.asset_id)} · ${row.filename || 'Datei'}` : section === 'transactions' ? assetName(row.asset_id) : assetName(row.asset_id)}</p><div className="record-detail">{details}</div>{section === 'contracts' && linkedDocument && <a className="record-link" href={`/api/documents/${linkedDocument.id}/download`}><Download size={14}/>{linkedDocument.title || linkedDocument.filename}</a>}{section === 'documents' && <div className="record-links"><a className="record-link" href={`/api/documents/${row.id}/preview`} target="_blank" rel="noreferrer"><Eye size={14}/>Vorschau</a><a className="record-link" href={`/api/documents/${row.id}/download`}><Download size={14}/>Herunterladen</a>{onAnalyze && <button className="record-link" type="button" onClick={() => onAnalyze(row)}><Search size={14}/>Lokal analysieren</button>}</div>}</div>
        <div className="record-actions"><button className="icon-button" aria-label={`${title} bearbeiten`} onClick={() => onEdit({...row, resource: editResource})}><Pencil size={16}/></button>{section !== 'reminders' && <button className="icon-button danger" aria-label={`${title} löschen`} onClick={() => onDelete(row)}><Trash2 size={16}/></button>}</div>
      </article>;
    })}
  </div>;
}

function ReminderCalendar({ items, onCreate }: { items: Row[]; onCreate: (date: string) => void }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [yearView, setYearView] = useState(false);
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const dates = Array.from({ length: 42 }, (_, index) => { const value = new Date(start); value.setDate(start.getDate() + index); return value; });
  const iso = (value: Date) => value.toLocaleDateString('sv-SE');
  const move = (amount: number) => setCursor(value => new Date(value.getFullYear(), value.getMonth() + amount, 1));
  return <section className="reminder-calendar panel"><div className="panel-heading"><div><h2>Terminübersicht</h2><p>{cursor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</p></div><div className="calendar-actions"><button className="icon-button" aria-label="Vorheriger Monat" onClick={() => move(yearView ? -12 : -1)}>‹</button><button className="secondary" onClick={() => setYearView(value => !value)}>{yearView ? 'Monatsansicht' : 'Jahresansicht'}</button><button className="icon-button" aria-label="Nächster Monat" onClick={() => move(yearView ? 12 : 1)}>›</button></div></div>{yearView ? <div className="year-grid">{Array.from({length:12},(_,month) => { const monthDate = new Date(cursor.getFullYear(), month, 1); const count = items.filter(item => { const value = new Date(`${item.due_date || item.end_date || item.reminder_date}T12:00:00`); return value.getFullYear() === cursor.getFullYear() && value.getMonth() === month; }).length; return <button key={month} onClick={() => { setCursor(monthDate); setYearView(false); }}><strong>{monthDate.toLocaleDateString('de-DE',{month:'long'})}</strong><span>{count} Termine</span></button>; })}</div> : <><div className="calendar-weekdays">{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{dates.map(value => { const date = iso(value); const entries = items.filter(item => String(item.due_date || item.end_date || item.reminder_date) === date); return <button key={date} onClick={() => onCreate(date)} className={`calendar-day ${value.getMonth() !== cursor.getMonth() ? 'outside' : ''} ${date === today() ? 'today' : ''}`}><b>{value.getDate()}</b>{entries.slice(0, 2).map(item => <span className={item.reminder_type === 'contract' ? 'contract' : item.reminder_type === 'document' ? 'document' : 'work'} title={String(item.title || item.name)} key={item.id}>{String(item.title || item.name).slice(0, 18)}</span>)}{entries.length > 2 && <small>+{entries.length - 2}</small>}</button>; })}</div><small className="calendar-hint">Tag auswählen, um einen neuen Eintrag zu planen.</small></>}</section>;
}

export default function Workspace() {
  const [section, setSection] = useState<Section>('dashboard');
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'light');
  const [mobile, setMobile] = useState(false);
  const [rows, setRows] = useState<Record<string, Row[]>>({});
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [globalQuery, setGlobalQuery] = useState('');
  const [filterAsset, setFilterAsset] = useState('');
  const [filterKind, setFilterKind] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [history, setHistory] = useState(false);
  const [editor, setEditor] = useState<{resource: string; row?: Row; defaultKind?: string; defaultAssetId?: string; defaultComponentId?: string; defaultDueDate?: string; defaultDirection?: 'income' | 'expense'} | null>(null);
  const [assetDetail, setAssetDetail] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [deletionInfo, setDeletionInfo] = useState<DependencyInfo | null>(null);
  const [deletionConfirmed, setDeletionConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<File | null>(null);
  const [preview, setPreview] = useState<{counts: Record<string, number>; files: number} | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [telegramPreview, setTelegramPreview] = useState<{counts: Record<string, number>; telegram_recipients: number; configured: boolean; message: string} | null>(null);
  const reload = useCallback(async () => {
    const data = await loadWorkspace();
    setRows(data.rows); setDashboard(data.dashboard);
  }, []);
  useEffect(() => {
    let active = true;
    loadWorkspace().then(data => { if (active) { setRows(data.rows); setDashboard(data.dashboard); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    function fromHash() { const value = location.hash.slice(1); if (nav.some(n => n[0] === value)) setSection(value as Section); }
    fromHash(); window.addEventListener('hashchange', fromHash); return () => window.removeEventListener('hashchange', fromHash);
  }, []);
  useEffect(() => {
    if (!editor && !deleting) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    dialog?.querySelector<HTMLElement>('input, select, button')?.focus();
    function trap(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) { setEditor(null); setDeleting(null); }
      if (e.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([type="hidden"]),select,textarea')).filter(el => el.offsetParent !== null);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    window.addEventListener('keydown', trap); return () => { window.removeEventListener('keydown', trap); previous?.focus(); };
  }, [editor, deleting, busy]);
  const assets = rows.assets || [];
  const documents = rows.documents || [];
  const resource = section === 'maintenance' || section === 'tasks' || section === 'tax' ? 'work-items' : section === 'properties' || section === 'vehicles' ? 'assets' : section === 'finance' ? 'transactions' : section;
  const assetName = (id: string | number | null) => id ? String(assets.find(a => a.id === id)?.name || '–') : 'Allgemein';
  const componentName = (id: string | number | null) => String((rows.components || []).find(component => component.id === id)?.name || 'Gesamtes Asset');
  function go(next: Section) { setSection(next); window.history.replaceState(null, '', '#' + next); setQuery(''); setFilterAsset(''); setFilterKind(''); setFilterMonth(''); setHistory(false); setMobile(false); setNotice(''); }
  async function act(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError('');
    try { await action(); await reload(); setNotice(message); } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function openDelete(row: Row) {
    setDeleting(row); setDeletionInfo(resource === 'assets' ? null : { total: 0, groups: {} }); setDeletionConfirmed(false); setError('');
    if (resource === 'assets') {
      try { setDeletionInfo(await api<DependencyInfo>(`records/assets/${row.id}/dependencies`)); }
      catch (e) { setError((e as Error).message); }
    }
  }
  function newEntry() { setEditor({ resource, defaultKind: section === 'maintenance' ? 'maintenance' : 'task' }); }
  async function analyzeDocument(row: Row) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{text_preview: string; source: string; suggested_category: string | null; confidence: number; review_required: boolean}>(`documents/${row.id}/analyze`, { method: 'POST' });
      if (!result.suggested_category) {
        setNotice(`Lokale Analyse abgeschlossen (${result.source}). Keine eindeutige Kategorie erkannt.`);
        return;
      }
      const label = categories[result.suggested_category] || result.suggested_category;
      if (!window.confirm(`Lokale Analyse schlägt „${label}“ vor. Vorschlag übernehmen?\n\nAuszug: ${result.text_preview.slice(0, 280)}`)) {
        setNotice('Analyse abgeschlossen. Vorschlag wurde nicht übernommen.');
        return;
      }
      await api(`documents/${row.id}/confirm-category`, json('POST', { category: result.suggested_category, expected_category: row.category, expected_sha256: row.sha256 }));
      await reload();
      setNotice(`Kategorie „${label}“ wurde nach deiner Bestätigung gespeichert.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function loadTelegramPreview() {
    setBusy(true); setError('');
    try { setTelegramPreview(await api('notifications/preview')); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function sendTelegram() {
    if (!window.confirm('Fällige Erinnerungen jetzt an die aktiven Telegram-Empfänger senden? Es werden nur Anzahlen, keine Titel oder Adressen übertragen.')) return;
    setBusy(true); setError('');
    try {
      const result = await api<{sent: number; already_sent: number}>('notifications/telegram/send', { method: 'POST', headers: { 'X-Confirm-Send': 'SEND_TELEGRAM' } });
      setNotice(`Telegram: ${result.sent} gesendet, ${result.already_sent} heute bereits versendet.`);
      await loadTelegramPreview();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const records = (rows[resource] || []).filter(row => {
    if (section === 'maintenance' && (row.kind !== 'maintenance' || (row.status === 'done') !== history)) return false;
    if (section === 'tasks' && (row.status === 'done') !== history) return false;
    if (section === 'tax' && (row.kind !== 'tax_return' || (row.status === 'done') !== history)) return false;
    if (section === 'properties' && !['building','property','equipment'].includes(String(row.kind))) return false;
    if (section === 'vehicles' && row.kind !== 'vehicle') return false;
    if (section === 'reminders' && (row.status === 'done' || String(row.due_date || row.end_date) > (() => { const d = new Date(); d.setDate(d.getDate() + 365); return d.toLocaleDateString('sv-SE'); })())) return false;
    if (filterAsset && row.asset_id !== filterAsset) return false;
    if (filterKind && (section === 'assets' ? row.kind : row.category) !== filterKind) return false;
    if (filterMonth && !String(row.document_date || row.booked_date).startsWith(filterMonth)) return false;
    return `${row.name || row.title} ${row.notes} ${assetName(row.asset_id)}`.toLocaleLowerCase('de').includes(query.toLocaleLowerCase('de'));
  }).sort((a, b) => { if (section === 'tasks' && !history) { const rank: Record<string, number> = { critical: 0, urgent: 0, high: 1, normal: 2, low: 3 }; const byPriority = (rank[String(a.priority || 'normal')] ?? 2) - (rank[String(b.priority || 'normal')] ?? 2); if (byPriority) return byPriority; } return section === 'documents' ? String(b.document_date).localeCompare(String(a.document_date)) : String(a.due_date || a.document_date || a.booked_date || a.name).localeCompare(String(b.due_date || b.document_date || b.booked_date || b.name)); });
  const globalResults = globalQuery.trim().length < 2 ? [] : ['assets','components','work-items','transactions','documents','contracts'].flatMap(resourceName =>
    (rows[resourceName] || []).map(row => ({ resourceName, row }))
  ).filter(({row}) => {
    const haystack = Object.values(row).filter(value => typeof value === 'string' || typeof value === 'number').join(' ').toLocaleLowerCase('de');
    return haystack.includes(globalQuery.toLocaleLowerCase('de'));
  }).slice(0, 12);
  function openGlobalResult(resourceName: string, row: Row) {
    if (resourceName === 'assets') {
      setGlobalQuery(''); setAssetDetail(row); return;
    }
    const target: Section = resourceName === 'work-items' ? 'tasks' : resourceName as Section;
    go(target); setQuery(String(row.name || row.title || row.filename || '')); setGlobalQuery('');
  }
  const stats = dashboard ? [['Assets im Bestand', String(dashboard.asset_count).padStart(2, '0'), Layers3, '']] as const : [];
  const systemConditions = assets.reduce<Record<string, number>>((result, asset) => {
    const key = getSystemCondition(asset.id, rows['work-items'] || []).key;
    result[key] = (result[key] || 0) + 1;
    return result;
  }, { good: 0, attention: 0, critical: 0 });
  function badge(row: Row) {
    const key = String(row.condition || row.status || '');
    return <span className={`badge ${key}`}>{conditions[key] || statuses[key] || key}</span>;
  }
  async function inspectBackup(file: File | undefined) {
    setPreview(null); setBackup(null); setConfirmation(''); if (!file) return;
    setBusy(true); setError('');
    try { const body = new FormData(); body.set('file', file); const result = await api<{counts: Record<string, number>; files: number}>('backup/preview', { method: 'POST', body }); setBackup(file); setPreview(result); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function exportBackup() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/backup/export');
      if (!response.ok) { const failure = await response.json(); throw new Error(failure.detail || 'Backup fehlgeschlagen'); }
      const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = `maintenance-vik-${today()}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); setNotice('Backup wurde zum Download bereitgestellt.');
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="app-shell">
    <aside className={`sidebar ${mobile ? 'is-open' : ''}`}>
      <a className="brand" href="#dashboard" onClick={() => go('dashboard')}><Image src="/logo.png" alt="maintenance.vik" width={170} height={90} unoptimized className="brand-logo"/><span>DEIN BESTAND. IM GRIFF.</span></a>
      <span className="nav-heading">ARBEITSPLATZ</span>
      <nav aria-label="Hauptnavigation">{nav.map(([id, label, Icon]) => <button key={id} onClick={() => go(id)} className={section === id ? 'active' : ''} aria-current={section === id ? 'page' : undefined}><Icon size={19}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><span className="local-dot"/> Lokaler Arbeitsbereich<small>maintenance.vik · Version 1.0 RC</small></div>
    </aside>
    {mobile && <button className="sidebar-shade" aria-label="Menü schließen" onClick={() => setMobile(false)}/>}
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-toggle" aria-label="Menü öffnen" onClick={() => setMobile(true)}><Menu/></button><span>Arbeitsplatz</span><ChevronRight size={14}/><strong>{nav.find(n => n[0] === section)?.[1]}</strong></div><div className="global-search"><label><Search size={17}/><input aria-label="Gesamten Bestand durchsuchen" placeholder="Alles durchsuchen …" value={globalQuery} onChange={e => setGlobalQuery(e.target.value)}/></label>{globalQuery.trim().length >= 2 && <div className="global-search-results">{globalResults.length ? globalResults.map(({resourceName,row}) => <button key={`${resourceName}-${row.id}`} onClick={() => openGlobalResult(resourceName,row)}><strong>{String(row.name || row.title || row.filename || 'Eintrag')}</strong><small>{({assets:'Asset',components:'Raum / Komponente','work-items':'Aufgabe / Wartung',transactions:'Finanzen',documents:'Dokument',contracts:'Vertrag'} as Record<string,string>)[resourceName]} · {assetName(row.asset_id)}</small></button>) : <span>Keine Treffer</span>}</div>}</div><div className="top-actions"><select aria-label="Design" value={theme} onChange={e => setTheme(e.target.value)}><option value="light">Hell</option><option value="dark">Dunkel</option></select><button className="icon-button" aria-label="Aufgaben und Termine öffnen" onClick={() => go('tasks')}><Bell size={19}/></button><ProfileMenu/></div></header>
      <main>
        <div className="page-heading"><div><span className="eyebrow">MAINTENANCE.VIK / {section === 'dashboard' ? 'COCKPIT' : 'VERWALTUNG'}</span><h1>{section === 'dashboard' ? 'Alles im Blick.' : nav.find(n => n[0] === section)?.[1]}</h1><p>{descriptions[section]}</p></div>{!['dashboard', 'settings', 'reminders', 'tax', 'finance'].includes(section) && <button className="primary" onClick={newEntry}><Plus size={18}/>{section === 'documents' ? 'Dokument hochladen' : 'Eintrag anlegen'}</button>}{section === 'dashboard' && <button className="primary" onClick={() => setEditor({resource: 'assets'})}><Plus size={18}/>Asset anlegen</button>}</div>
        {error && <div className="error" role="alert">{error}<button className="icon-button" aria-label="Fehlermeldung schließen" onClick={() => setError('')}><X size={16}/></button></div>}
        {notice && <div className="notice" role="status"><Check size={18}/>{notice}</div>}
        {loading ? <div className="empty">Bestand wird geladen …</div> : !dashboard ? <div className="empty"><h2>Verbindung noch nicht bereit</h2><p>Das Backend muss erreichbar sein, um deinen Bestand zu laden.</p><button className="secondary" onClick={() => act(reload, 'Verbindung wiederhergestellt.')}>Erneut versuchen</button></div> : <>
        {section === 'dashboard' && <>
          <div className="section-label"><span>Bestandsübersicht</span><span>Gebäude, Grundstücke, Anlagen und Fahrzeuge</span></div>
          <div className="stats-grid">{stats.map(([label, value, Icon, tone]) => <article className="stat" key={label}><div><span>{label}</span><Icon size={19}/></div><strong className={tone}>{value}</strong><small>Gebäude, Fahrzeuge & Anlagen</small></article>)}</div>
          <div className="dashboard-grid"><section className="panel schedule"><div className="panel-heading"><div><h2>Was als Nächstes ansteht</h2><p>Deine offenen Wartungen, Aufgaben und Termine</p></div><button className="text-button" onClick={() => go('tasks')}>Alle ansehen <ChevronRight size={16}/></button></div>
            {dashboard.upcoming.length ? dashboard.upcoming.map(row => <button className="schedule-row" key={row.id} onClick={() => setEditor({resource: 'work-items', row})}><span className={`date-tile ${String(row.due_date) < today() ? 'late' : ''}`}><b>{String(row.due_date).slice(8)}</b><small>{new Date(`${row.due_date}T12:00:00`).toLocaleDateString('de-DE', {month: 'short'})}</small></span><span className="schedule-title"><strong>{row.title}</strong><small>{assetName(row.asset_id)} · {workKinds[String(row.kind)]}</small></span><span className={`badge ${String(row.due_date) < today() ? 'critical' : 'open'}`}>{String(row.due_date) < today() ? 'Überfällig' : statuses[String(row.status)]}</span><ChevronRight size={16}/></button>) : <div className="empty compact"><CalendarDays/><h3>Platz für deine nächsten Schritte</h3><p>Lege eine Wartung oder Aufgabe an.</p><button className="secondary" onClick={() => setEditor({resource:'work-items', defaultKind:'maintenance'})}>Wartung planen</button></div>}
          </section><section className="panel condition-panel"><span className="eyebrow">SYSTEMSTATUS</span><h2>Automatisch aus Wartungen & Mängeln</h2><div className="condition-number">{systemConditions.good}<span> / {dashboard.asset_count}</span></div><p>Assets ohne aktuellen Handlungsbedarf</p><div className="condition-bar">{Object.entries(systemConditions).map(([key, count]) => <span key={key} className={key} style={{flex: count || 0.001}}/>)}</div>{Object.entries(conditions).map(([key, label]) => <div className="legend" key={key}><span><i className={key}/>{label}</span><b>{systemConditions[key] || 0}</b></div>)}<div className="attention-summary"><span><b>{dashboard.maintenance_due}</b> Wartungen in 30 Tagen</span><span><b>{dashboard.overdue}</b> überfällige Einträge</span></div></section></div>
          <section className="assets-preview"><div className="panel-heading"><div><h2>Dein Bestand</h2><p>Ein Zuhause für alles, was du verwaltest.</p></div><button className="text-button" onClick={() => go('assets')}>Alle Assets <ChevronRight size={16}/></button></div><div className="asset-grid">{assets.slice(0, 3).map(row => <button className="asset-card" key={row.id} onClick={() => setAssetDetail(row)}><span className={`asset-illustration ${row.kind}`}>{row.cover_document_id ? <Image src={`/api/assets/${row.id}/image`} alt="" fill unoptimized sizes="(max-width: 600px) 115px, 33vw"/> : row.kind === 'building' ? <Building2/> : row.kind === 'vehicle' ? <CarFront/> : row.kind === 'property' ? <LandPlot/> : <Factory/>}<span>{kinds[String(row.kind)]}</span></span><span className="asset-card-body"><strong>{row.name}</strong><small>{row.location || 'Kein Standort hinterlegt'}</small><span className="asset-status-stack">{badge(row)}<span className={`badge ${getSystemCondition(row.id, rows['work-items'] || []).key}`} title={getSystemCondition(row.id, rows['work-items'] || []).reason}>System: {conditions[getSystemCondition(row.id, rows['work-items'] || []).key]}</span></span></span></button>)}</div>{!assets.length && <div className="empty"><Building2 size={32}/><h3>Willkommen in deinem Arbeitsbereich</h3><p>Lege dein erstes Asset an oder starte mit klar gekennzeichneten Beispieldaten.</p><button className="secondary" disabled={busy} onClick={() => act(() => api('seed', {method:'POST'}), 'Beispieldaten angelegt. Du kannst sie bearbeiten oder löschen.')}>Beispieldaten laden</button></div>}</section>
        </>}
        {section === 'tax' && <TaxCenter/>}
        {section === 'finance' && <FinanceOverview assets={assets} components={rows.components || []} transactions={rows.transactions || []} contracts={rows.contracts || []} onCreateIncome={(assetId, componentId) => setEditor({resource:'transactions', defaultDirection:'income', defaultAssetId:assetId, defaultComponentId:componentId})} onCreateExpense={(assetId, componentId) => setEditor({resource:'transactions', defaultDirection:'expense', defaultAssetId:assetId, defaultComponentId:componentId})} onCreateContract={assetId => setEditor({resource:'contracts', defaultAssetId:assetId})} onEditTransaction={row => setEditor({resource:'transactions', row})} onEditContract={row => setEditor({resource:'contracts', row})}/>} 
        {!['dashboard','settings','tax','finance'].includes(section) && <>
          {(section === 'maintenance' || section === 'tasks') && <div className="tabs"><button className={!history ? 'selected' : ''} onClick={() => setHistory(false)}>Offene Einträge</button><button className={history ? 'selected' : ''} onClick={() => setHistory(true)}>Historie / Erledigt</button></div>}
          {section === 'tasks' && <ReminderCalendar items={rows.reminders || []} onCreate={date => setEditor({resource: 'work-items', defaultKind: 'task', defaultDueDate: date})}/>} 
          {section === 'documents' && <div className="info-strip"><FileText size={18}/>Lokale OCR kann Titel, Datum, Kategorie und Objektzuordnung vorschlagen. Alle Vorschläge bleiben korrigierbar.</div>}
          <div className="filters"><label className="search"><Search size={18}/><input aria-label="Einträge durchsuchen" placeholder="Suchen …" value={query} onChange={e => setQuery(e.target.value)}/></label>{section !== 'assets' && <select aria-label="Nach Asset filtern" value={filterAsset} onChange={e => setFilterAsset(e.target.value)}><option value="">Alle Assets</option>{assets.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select>}{['assets','documents','transactions'].includes(section) && <select aria-label="Nach Kategorie filtern" value={filterKind} onChange={e => setFilterKind(e.target.value)}><option value="">{section === 'assets' ? 'Alle Asset-Typen' : 'Alle Kategorien'}</option>{Object.entries(section === 'assets' ? kinds : section === 'transactions' ? transactionCategories : categories).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>}{['documents','transactions'].includes(section) && <input aria-label="Nach Monat filtern" type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}/>}<span className="result-count">{records.length} Einträge</span></div>
          {(section === 'assets' || section === 'properties' || section === 'vehicles') && <AssetGallery assets={records} allAssets={assets} workItems={rows['work-items'] || []} onOpen={setAssetDetail} onEdit={row => setEditor({resource:'assets', row})} onDelete={openDelete} />}
          {section === 'components' && <><div className="info-strip"><Layers3 size={18}/>Lege Räume, Bereiche und Bauteile als übersichtliche Bausteine deines Assets an.</div>{records.length ? <ComponentGallery components={records} assetName={assetName} onEdit={row => setEditor({resource:'components', row})} onDelete={openDelete}/> : <div className="empty panel"><Layers3 size={30}/><h3>{query || filterAsset ? 'Keine passenden Einträge' : 'Noch keine Räume oder Komponenten'}</h3><p>{query || filterAsset ? 'Passe Suche oder Asset-Filter an.' : 'Lege zuerst einen Raum, Bereich oder ein Bauteil an.'}</p></div>}</>}
          {(section === 'maintenance' || section === 'tasks' || section === 'tax') && (records.length ? <WorkItemGallery items={records} assetName={assetName} componentName={componentName} onEdit={row => setEditor({resource:'work-items', row})} onDelete={openDelete}/> : <div className="empty panel"><CalendarDays size={30}/><h3>{query || filterAsset ? 'Keine passenden Einträge' : section === 'tax' ? 'Noch keine Steuerfälle' : section === 'maintenance' ? 'Noch keine Wartungen' : 'Noch keine Aufgaben oder Mängel'}</h3><p>{query || filterAsset ? 'Passe Suche oder Asset-Filter an.' : 'Lege einen neuen Eintrag an, damit er hier übersichtlich erscheint.'}</p></div>)}
          {section === 'transactions' && <div className="info-strip">Gefilterter Saldo: <strong>{money(records.reduce((sum, row) => sum + Number(row.amount_cents) * (row.direction === 'income' ? 1 : -1), 0))}</strong></div>}
          {section === 'reminders' && <ReminderCalendar items={records} onCreate={date => setEditor({resource: 'work-items', defaultKind: 'task', defaultDueDate: date})}/>} 
          {(['contracts','transactions','documents','reminders'].includes(section)) && (records.length ? <RecordGallery section={section as 'contracts' | 'transactions' | 'documents' | 'reminders'} records={records} documents={documents} assetName={assetName} onEdit={row => setEditor({resource: String(row.resource || section), row})} onDelete={openDelete} onAnalyze={section === 'documents' ? analyzeDocument : undefined}/> : <div className="empty panel"><FileText size={30}/><h3>{query || filterAsset || filterKind || filterMonth ? 'Keine passenden Einträge' : 'Hier beginnt deine Übersicht'}</h3><p>{query || filterAsset || filterKind || filterMonth ? 'Passe Suche oder Filter an.' : 'Neue Einträge erscheinen hier, sobald du sie anlegst.'}</p></div>)}
          <div className={`panel table-wrap ${section === 'assets' || section === 'properties' || section === 'vehicles' || section === 'components' || section === 'maintenance' || section === 'tasks' || section === 'tax' || section === 'contracts' || section === 'transactions' || section === 'documents' || section === 'reminders' ? 'asset-table-hidden' : ''}`}><table></table></div>
        </>}
        {section === 'settings' && <div className="settings-grid">
          <div className="settings-column settings-column-system">
            <section className="panel settings-panel"><ShieldCheck size={28}/><h2>Deine Daten. Deine Sicherung.</h2><p>Exportiere alle Datensätze und zugehörigen Dokumente/Bilder gemeinsam als ZIP-Datei.</p><button className="primary" disabled={busy} onClick={exportBackup}><Download size={18}/>Backup exportieren</button><hr/><h3>Backup wiederherstellen</h3><p>Das Backup ersetzt den gesamten aktuellen Datenbestand. Exportiere vorher eine Sicherung. Die Datei wird vor dem Import auf Version, Verknüpfungen und Prüfsummen geprüft.</p><label className="upload-field"><Upload size={20}/>Backup auswählen (ZIP, bis 250 MB)<input type="file" accept=".zip" disabled={busy} onChange={e => inspectBackup(e.target.files?.[0])}/></label>{preview && <div className="restore-preview"><h3>Backup geprüft</h3>{Object.entries(preview.counts).map(([name,count]) => <p key={name}>{({assets:'Assets',components:'Räume / Komponenten','work-items':'Wartungen / Aufgaben',transactions:'Finanzeinträge',documents:'Dokumente'} as Record<string,string>)[name]}: <strong>{count}</strong></p>)}<label>Zum Ersetzen WIEDERHERSTELLEN eingeben<input value={confirmation} onChange={e => setConfirmation(e.target.value)}/></label><button className="danger-button" disabled={busy || confirmation !== 'WIEDERHERSTELLEN'} onClick={() => act(async () => {const body = new FormData(); body.set('file', backup!); body.set('confirmation', confirmation); await api('backup/import', {method:'POST',body}); setPreview(null); setBackup(null); setConfirmation('');}, 'Backup erfolgreich wiederhergestellt.')}>Gesamten Bestand ersetzen</button></div>}</section>
            <section className="panel settings-panel"><h2>Papierkorb</h2><p>Gelöschte Einträge bleiben hier wiederherstellbar, bis du sie endgültig entfernst.</p><div className="recipient-list">{(rows.trash || []).length ? (rows.trash || []).map(item => <div className="recipient-row" key={item.id}><div><strong>{item.label || 'Gelöschter Eintrag'}</strong><small>{item.resource} · {new Date(String(item.deleted_at)).toLocaleString('de-DE')}</small></div><button className="secondary" disabled={busy} onClick={() => act(() => api(`trash/${item.id}/restore`, {method:'POST'}), 'Eintrag wiederhergestellt.')}>Wiederherstellen</button><button className="icon-button danger" disabled={busy} aria-label="Endgültig löschen" onClick={() => { if (window.confirm('Diesen Papierkorb-Eintrag endgültig löschen?')) act(() => api(`trash/${item.id}`, {method:'DELETE'}), 'Papierkorb-Eintrag endgültig gelöscht.'); }}><Trash2 size={16}/></button></div>) : <small>Der Papierkorb ist leer.</small>}</div></section>
            <section className="panel settings-panel"><h2>Über diesen Arbeitsbereich</h2><p>Version 1.0 RC · Lokaler Betrieb mit individuellen Admin- und Leser-Konten.</p><p>Finanzen dienen der Übersicht, nicht der vollständigen Buchhaltung. Daten bleiben in deiner Installation.</p></section>
          </div>
          <div className="settings-column settings-column-main">
            <section className="panel settings-panel"><h2>Anbindungen</h2><div className="integration"><strong>Lokale Dokumentenanalyse / OCR</strong><span className="badge open">Verfügbar</span><p>PDFs, Bilder, TXT, CSV und DOCX können lokal analysiert werden. Kategorien werden nur nach deiner Bestätigung gespeichert.</p></div><div className="integration"><strong>Telegram</strong><span className="badge open">Verfügbar</span><p>Erinnerungen können datensparsam versendet werden. Telegram erhält nur Anzahlen, keine Titel, Adressen, Beträge oder Steuerinhalte.</p><TelegramSettings/><div className="record-links"><button className="secondary" disabled={busy} onClick={loadTelegramPreview}>Vorschau laden</button>{telegramPreview?.configured && <button className="primary" disabled={busy || !telegramPreview.telegram_recipients} onClick={sendTelegram}>Jetzt senden</button>}</div>{telegramPreview && <small>{telegramPreview.telegram_recipients} Telegram-Empfänger · {telegramPreview.configured ? "Bot aktiviert" : "Bot noch nicht aktiviert"} · Aufgaben/Wartungen {telegramPreview.counts.work_items || 0}, Verträge {telegramPreview.counts.contracts || 0}, Dokumente {telegramPreview.counts.documents || 0}</small>}</div></section>
            <section className="panel settings-panel"><h2>Benachrichtigungsempfänger</h2><p>Hinterlege einen oder mehrere Telegram-Chats für Erinnerungen.</p><div className="recipient-list">{(rows["notification-recipients"] || []).map(recipient => <div className="recipient-row" key={recipient.id}><div><strong>{recipient.label}</strong><small>Telegram · {recipient.address}</small></div><span className={`badge ${recipient.active ? "open" : ""}`}>{recipient.active ? "Aktiv" : "Pausiert"}</span><button className="icon-button" aria-label={`${recipient.label} bearbeiten`} onClick={() => setEditor({resource:"notification-recipients", row:recipient})}><Pencil size={16}/></button><button className="icon-button danger" aria-label={`${recipient.label} löschen`} onClick={() => act(() => api(`records/notification-recipients/${recipient.id}`, {method:"DELETE"}), "Empfänger gelöscht.") }><Trash2 size={16}/></button></div>)}</div><button className="secondary" onClick={() => setEditor({resource:"notification-recipients"})}>Empfänger hinzufügen</button></section>
            <UserManagement/>
            <section className="panel settings-panel"><h2>Aktivitätsverlauf</h2><p>Die letzten Änderungen an deinem Bestand.</p><div className="activity-list">{(rows.activity || []).slice(0, 30).map(item => <div className="activity-row" key={item.id}><span className="badge open">{({created:'Angelegt',updated:'Geändert',deleted:'Gelöscht',restored:'Wiederhergestellt',purged:'Endgültig gelöscht'} as Record<string,string>)[String(item.action)] || item.action}</span><div><strong>{item.label || item.resource}</strong><small>{new Date(String(item.created_at)).toLocaleString('de-DE')} · {item.resource}</small></div></div>)}{!(rows.activity || []).length && <small>Noch keine protokollierten Änderungen.</small>}</div></section>
          </div>
        </div>}
        </>}
        <footer className="page-footer"><span>maintenance.vik</span><span>Werte erhalten. Überblick behalten.</span></footer>
      </main>
    </div>
    {assetDetail && <AssetDetail asset={assetDetail} components={(rows.components || []).filter(item => item.asset_id === assetDetail.id)} workItems={rows['work-items'] || []} documents={documents} contracts={(rows.contracts || []).filter(item => item.asset_id === assetDetail.id)} transactions={rows.transactions || []} close={() => setAssetDetail(null)} edit={() => { setAssetDetail(null); setEditor({resource: 'assets', row: assetDetail}); }} create={(target, defaultKind) => { setAssetDetail(null); setEditor({resource: target, defaultKind, defaultAssetId: String(assetDetail.id)}); }}/>} 
    {editor && <Editor {...editor} assets={assets} components={rows.components || []} documents={rows.documents || []} close={() => setEditor(null)} saved={async () => { await reload(); setNotice('Eintrag gespeichert.'); }}/ >}
    {deleting && <div className="overlay"><section className="modal small-modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Eintrag löschen?</h2><p>„{deleting.name || deleting.title}“ wird dauerhaft gelöscht.</p>{deletionInfo === null ? <p className="delete-loading">Verknüpfungen werden geprüft …</p> : deletionInfo.total > 0 ? <div className="delete-dependencies"><strong>Diese Verknüpfungen werden ebenfalls gelöscht:</strong>{Object.entries(deletionInfo.groups).filter(([, items]) => items.length > 0).map(([group, items]) => <div className="delete-group" key={group}><span>{({components:'Räume / Komponenten',work_items:'Wartungen und Aufgaben',transactions:'Finanzeinträge',documents:'Dokumente'} as Record<string,string>)[group] || group}</span><ul>{items.map(item => <li key={item.id}>{String(item.name || item.title || item.filename || 'Eintrag')}</li>)}</ul></div>)}<label className="delete-confirm"><input type="checkbox" checked={deletionConfirmed} onChange={e => setDeletionConfirmed(e.target.checked)}/>Ja, ich möchte alle aufgeführten Verknüpfungen mit löschen.</label></div> : <p className="delete-safe">Keine verknüpften Einträge gefunden.</p>}<footer><button className="secondary" disabled={busy} onClick={() => setDeleting(null)}>Abbrechen</button><button className="danger-button" disabled={busy || deletionInfo === null || (deletionInfo.total > 0 && !deletionConfirmed)} onClick={() => act(async () => {const cascade = resource === 'assets' && !!deletionInfo?.total; await api(`records/${resource}/${deleting.id}${cascade ? '?cascade=true' : ''}`, {method:'DELETE'}); setDeleting(null); setDeletionInfo(null); setDeletionConfirmed(false);}, deletionInfo?.total ? 'Eintrag und Verknüpfungen gelöscht.' : 'Eintrag gelöscht.')}>{deletionInfo?.total ? 'Mit Verknüpfungen löschen' : 'Endgültig löschen'}</button></footer></section></div>}
  </div>;
}
