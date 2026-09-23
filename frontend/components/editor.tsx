'use client';
import { useState } from 'react';
import AddressMap from './address-map';
import { FileText, X } from 'lucide-react';
import { api, billingCycles, categories, conditions, json, kinds, Row, statuses, today, transactionCategories, workKinds } from '../lib/data';

type Props = { resource: string; row?: Row; assets: Row[]; components: Row[]; documents: Row[]; defaultKind?: string; defaultAssetId?: string; defaultComponentId?: string; defaultDueDate?: string; defaultDirection?: 'income' | 'expense'; close: () => void; saved: () => Promise<void> };
export default function Editor({ resource, row, assets, components, documents, defaultKind, defaultAssetId, defaultComponentId, defaultDueDate, defaultDirection = 'expense', close, saved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [assetId, setAssetId] = useState(String(row?.asset_id || defaultAssetId || (resource === 'transactions' ? '' : assets[0]?.id || '')));
  const [componentId, setComponentId] = useState(String(row?.component_id || defaultComponentId || ''));
  const [assetKind, setAssetKind] = useState(String(row?.kind || 'building'));
  const [propertyId, setPropertyId] = useState(String(row?.property_id || ''));
  const [location, setLocation] = useState(String(row?.location || ''));
  const [workKind, setWorkKind] = useState(String(row?.kind || defaultKind || 'task'));
  const [documentTitle, setDocumentTitle] = useState(String(row?.title || ''));
  const [documentDate, setDocumentDate] = useState(String(row?.document_date || today()));
  const [documentCategory, setDocumentCategory] = useState(String(row?.category || 'other'));
  const [documentAnalysis, setDocumentAnalysis] = useState('');
  const [documentAnalyzing, setDocumentAnalyzing] = useState(false);
  const selectedAsset = assets.find(asset => String(asset.id) === assetId);
  const value = (name: string, fallback = '') => String(row?.[name] ?? fallback);
  const select = (name: string, label: string, options: Record<string, string>, fallback = '') => <label>{label}<select name={name} defaultValue={value(name, fallback)}>{Object.entries(options).map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select></label>;
  const input = (name: string, label: string, type = 'text', fallback = '', required = true) => <label>{label}<input name={name} type={type} defaultValue={value(name, fallback)} required={required} maxLength={type === 'text' ? 160 : undefined} /></label>;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      if (resource === 'assets') {
        const image = data.get('cover_image');
        const body: Record<string, unknown> = Object.fromEntries(data.entries());
        delete body.cover_image;
        body.contact_birth_date = body.contact_birth_date || null;
        body.property_id = body.property_id || null;
        const savedAsset = await api<Row>(`records/assets${row ? '/' + row.id : ''}`, json(row ? 'PUT' : 'POST', body));
        if (image instanceof File && image.size) {
          const upload = new FormData(); upload.set('file', image);
          await api(`assets/${savedAsset.id}/image`, { method: 'POST', body: upload });
        }
      } else if (resource === 'documents' && !row) {
        await api<Row>('documents/upload', { method: 'POST', body: data });
      } else {
        const body: Record<string, unknown> = Object.fromEntries(data.entries());
        if (resource === 'transactions') {
          body.amount_cents = Math.round(Number(String(body.amount).replace(',', '.')) * 100); delete body.amount;
          body.asset_id = body.asset_id || null;
          body.component_id = body.component_id || null;
        }
        if (resource === 'documents') {
          body.reminder_days = Number(body.reminder_days || 30);
          body.reminder_date = body.reminder_date || null;
        }
        if (resource === 'notification-recipients') {
          body.active = data.get('active') === 'on';
          body.notify_contracts = data.get('notify_contracts') === 'on';
          body.notify_documents = data.get('notify_documents') === 'on';
          body.notify_work_items = data.get('notify_work_items') === 'on';
        }
        if (resource === 'contracts') {
          body.amount_cents = Math.round(Number(String(body.amount).replace(',', '.')) * 100); delete body.amount;
          body.reminder_days = Number(body.reminder_days || 30);
          body.document_id = body.document_id || null;
          const contractFile = data.get('contract_file');
          delete body.contract_file;
          const contract = await api<Row>(`records/contracts${row ? '/' + row.id : ''}`, json(row ? 'PUT' : 'POST', body));
          if (contractFile instanceof File && contractFile.size) {
            const upload = new FormData(); upload.set('file', contractFile); upload.set('asset_id', String(body.asset_id)); upload.set('title', String(body.title)); upload.set('document_date', String(body.start_date)); upload.set('category', 'insurance'); upload.set('notes', 'Vertragsdokument');
            const document = await api<Row>('documents/upload', { method: 'POST', body: upload });
            await api(`records/contracts/${contract.id}`, json('PUT', { ...body, document_id: document.id }));
          }
          await saved(); close(); return;
        }
        if (resource === 'work-items') {
          body.interval_days = body.interval_days ? Number(body.interval_days) : null;
          body.component_id = body.component_id || null;
        }
        await api(`records/${resource}${row ? '/' + row.id : ''}`, json(row ? 'PUT' : 'POST', body));
      }
      await saved(); close();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function analyzeSelectedDocument(file: File | null) {
    if (!file) return;
    setDocumentAnalyzing(true); setError(''); setDocumentAnalysis('Dokument wird lokal analysiert …');
    try {
      const body = new FormData(); body.set('file', file);
      const result = await api<{
        suggested_title: string;
        suggested_date: string | null;
        suggested_category: string | null;
        suggested_asset_id: string | null;
        text_preview: string;
        source: string;
      }>('documents/analyze-upload', { method: 'POST', body });
      if (result.suggested_title) setDocumentTitle(result.suggested_title);
      if (result.suggested_date) setDocumentDate(result.suggested_date);
      if (result.suggested_category) setDocumentCategory(result.suggested_category);
      if (result.suggested_asset_id) setAssetId(result.suggested_asset_id);
      setDocumentAnalysis(`OCR abgeschlossen (${result.source}). Vorschläge wurden eingetragen – bitte kurz prüfen.`);
    } catch (e) {
      setDocumentAnalysis('OCR konnte keine Vorschläge übernehmen. Das Dokument kann trotzdem manuell gespeichert werden.');
      setError((e as Error).message);
    } finally {
      setDocumentAnalyzing(false);
    }
  }

  return <div className="overlay" onClick={e => { if (e.target === e.currentTarget && !busy) close(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="editor-title" className="modal">
      <header><div><span className="eyebrow">BESTAND VERWALTEN</span><h2 id="editor-title">{row ? 'Eintrag bearbeiten' : resource === 'documents' ? 'Dokument hochladen' : resource === 'contracts' ? 'Vertrag anlegen' : resource === 'notification-recipients' ? 'Empfänger anlegen' : 'Neuen Eintrag anlegen'}</h2></div><button className="icon-button" aria-label="Schließen" onClick={close} disabled={busy}><X size={20}/></button></header>
      <form onSubmit={submit}>
        <div className="form-grid">
          {resource === 'assets' ? <>{input('name', 'Bezeichnung')}<label>Bereich<select name="kind" value={assetKind} onChange={event => setAssetKind(event.target.value)}>{Object.entries(kinds).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>{assetKind === 'vehicle' ? <><label className="span-two">Standort / Stellplatz <input name="location" value={location} onChange={e => setLocation(e.target.value)} placeholder="Garage, Stellplatz oder Standort" maxLength={300}/></label><label className="span-two">Zugeordnet zu Immobilie <select name="property_id" value={propertyId} onChange={e => setPropertyId(e.target.value)}><option value="">Keine Zuordnung</option>{assets.filter(asset => asset.id !== row?.id && asset.kind !== 'vehicle').map(asset => <option value={asset.id} key={asset.id}>{asset.name}{asset.location ? ` · ${asset.location}` : ''}</option>)}</select><small>Ordne das Fahrzeug dem passenden Gebäude, Grundstück oder technischen Standort zu.</small></label></> : <><label className="span-two">Standort / Adresse<input name="location" value={location} onChange={e => setLocation(e.target.value)} placeholder="Straße, Hausnummer, Ort" maxLength={300}/></label><div className="span-two"><AddressMap address={location}/></div></>}{select('condition', 'Zustand', conditions, 'good')}<label className="span-two upload-field">Bild für die Asset-Karte <input name="cover_image" type="file" accept=".png,.jpg,.jpeg,.webp"/><small>PNG, JPG oder WEBP · maximal 10 MB. Das Bild wird mit deinen Dokumenten gesichert.</small></label><div className="span-two form-subheading">Ansprechperson <small>Halter, Fahrer oder zuständiger Kontakt</small></div>{input('contact_first_name', 'Vorname', 'text', '', false)}{input('contact_last_name', 'Nachname', 'text', '', false)}{input('contact_birth_date', 'Geburtsdatum', 'date', '', false)}</> : resource === 'notification-recipients' ? <>{select('channel', 'Kanal', { telegram: 'Telegram' }, 'telegram')}{input('label', 'Name / Bezeichnung')}{input('address', 'Telegram Chat-ID') }<label className="span-two"><span>Empfang aktiv</span><input name="active" type="checkbox" defaultChecked={row ? String(row.active) !== 'false' : true}/></label><div className="span-two form-subheading">Erinnerungstypen</div><label className="check-field"><input name="notify_contracts" type="checkbox" defaultChecked={row ? String(row.notify_contracts) !== 'false' : true}/>Vertragsende</label><label className="check-field"><input name="notify_documents" type="checkbox" defaultChecked={row ? String(row.notify_documents) !== 'false' : true}/>Dokumente und Steuern</label><label className="check-field"><input name="notify_work_items" type="checkbox" defaultChecked={row ? String(row.notify_work_items) !== 'false' : true}/>Wartungen und Aufgaben</label></> : <>
            <label>{resource === 'transactions' ? 'Objekt / Asset (optional)' : 'Asset'}<select name="asset_id" value={assetId} onChange={e => { setAssetId(e.target.value); setComponentId(''); }} required={resource !== 'transactions'}>{resource === 'transactions' && <option value="">Allgemein / ohne Objekt</option>}{!assets.length && resource !== 'transactions' && <option value="">Bitte zuerst ein Asset anlegen</option>}{assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            {resource === 'documents'
              ? <label>Dokumentbezeichnung<input name="title" value={documentTitle} onChange={e => setDocumentTitle(e.target.value)} required maxLength={160}/></label>
              : input(resource === 'components' ? 'name' : 'title', resource === 'components' ? 'Bezeichnung' : resource === 'contracts' ? 'Vertragsname' : resource === 'transactions' ? 'Buchungsbezeichnung' : workKind === 'maintenance' ? 'Welche Wartung?' : workKind === 'defect' ? 'Welcher Mangel?' : 'Was ist zu erledigen?')}
          </>}
          {resource === 'components' && select('kind', 'Art', { room: 'Raum', floor: 'Etage', area: 'Bereich', component: 'Komponente' }, 'component')}
          {resource === 'work-items' && <>
            <label>Art<select name="kind" value={workKind} onChange={e => setWorkKind(e.target.value)}>{Object.entries(workKinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Raum / Komponente<select key={assetId} name="component_id" defaultValue={value('component_id')}><option value="">Gesamtes Asset</option>{components.filter(c => c.asset_id === assetId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            {input('due_date', 'Fällig am', 'date', defaultDueDate || today())}{select('status', 'Status', statuses, 'open')}{workKind === 'maintenance' ? <input type="hidden" name="priority" value="normal"/> : select('priority', 'Priorität', { low: 'Niedrig', normal: 'Normal', high: 'Hoch', critical: 'Kritisch', urgent: 'Kritisch (bestehend)' }, 'normal')}
            {(workKind === 'maintenance' || workKind === 'tax_return') ? <label>Wiederholung in Tagen <input name="interval_days" type="number" min="1" max="3650" defaultValue={value('interval_days', workKind === 'tax_return' ? '365' : '')}/><small>Für die jährliche Steuererklärung: 365 Tage.</small></label> : <input type="hidden" name="interval_days" value=""/>}
          </>}
          {resource === 'transactions' && <>
            {select('direction', 'Buchungsart', { income: 'Einnahme', expense: 'Ausgabe' }, defaultDirection)}
            <label>Bereich / Etage / Raum / Komponente<select name="component_id" value={componentId} disabled={!assetId} onChange={e => setComponentId(e.target.value)}><option value="">Gesamtes Objekt</option>{components.filter(component => String(component.asset_id) === assetId).map(component => <option value={component.id} key={component.id}>{component.name}</option>)}</select><small>{assetId ? 'Optional: genauer Bereich innerhalb des Objekts.' : 'Zuerst ein Objekt wählen, wenn die Buchung zugeordnet werden soll.'}</small></label>
            <label>Betrag in EUR<input name="amount" type="number" min="0.01" step="0.01" max="20000000" required defaultValue={row ? Number(row.amount_cents) / 100 : ''}/></label>
            {input('booked_date', 'Datum', 'date', today())}{select('category', 'Kategorie', transactionCategories, defaultDirection === 'income' ? 'salary' : 'other')}
          </>}
          {resource === 'documents' && <>
            <label>Dokumentdatum<input name="document_date" type="date" value={documentDate} onChange={e => setDocumentDate(e.target.value)} required/></label>
            <label>Kategorie<select name="category" value={documentCategory} onChange={e => setDocumentCategory(e.target.value)}>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            {input('reminder_date', 'Erinnerung am (optional)', 'date', '', false)}<label>Erinnerung vorher (Tage)<input name="reminder_days" type="number" min="0" max="365" defaultValue={value('reminder_days', '30')}/></label>
            {!row && <><label className="span-two upload-field">Datei auswählen<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx" required onChange={e => void analyzeSelectedDocument(e.target.files?.[0] || null)}/><small>Nach der Auswahl versucht die lokale OCR automatisch Bezeichnung, Datum, Kategorie und Objekt vorzuschlagen.</small></label>{documentAnalysis && <div className="span-two info-strip"><FileText size={17}/>{documentAnalysis}</div>}</>}
          </>}
          {resource === 'contracts' && <>
            {input('provider', 'Anbieter', 'text', '', false)}{selectedAsset?.kind !== 'vehicle' && input('market_location_id', 'Marktlokations-ID (nur Energievertrag)', 'text', '', false)}
            <label className="span-two">Vertragsdokument<select key={assetId} name="document_id" defaultValue={value('document_id')}><option value="">Kein Dokument zugeordnet</option>{documents.filter(document => String(document.asset_id) === assetId).map(document => <option value={document.id} key={document.id}>{document.title || document.filename} · {categories[String(document.category)]}</option>)}</select><small>Es werden die Dokumente des ausgewählten Assets angezeigt.</small></label>
            <label className="span-two upload-field">Neues Vertragsdokument hochladen<input name="contract_file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"/><small>Wird nach dem Speichern automatisch diesem Vertrag und dem ausgewählten Objekt zugeordnet.</small></label>
            <label>Betrag in EUR<input name="amount" type="number" min="0.01" step="0.01" max="20000000" required defaultValue={row ? Number(row.amount_cents) / 100 : ''}/></label>{select('billing_cycle', 'Abrechnung', billingCycles, 'monthly')}
            {input('start_date', 'Vertragsbeginn', 'date', today())}{input('end_date', 'Vertragsende', 'date', row?.end_date ? String(row.end_date) : new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10))}
            <label>Erinnerung vor Vertragsende (Tage)<input name="reminder_days" type="number" min="0" max="365" defaultValue={value('reminder_days', '30')}/></label>
            <div className="span-two info-strip"><FileText size={17}/>Vertragsdokumente können zugeordnet werden. Die automatische KI-Erkennung von Anbieter, Laufzeit, Betrag und MaLo-ID ist vorbereitet.</div>
          </>}
          {resource !== 'notification-recipients' && <label className="span-two">Notizen<textarea name="notes" rows={3} maxLength={10000} defaultValue={value('notes')} placeholder="Zusätzliche Informationen …"/></label>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <footer><button type="button" className="secondary" onClick={close} disabled={busy}>Abbrechen</button><button className="primary" disabled={busy || documentAnalyzing || (resource !== 'assets' && resource !== 'notification-recipients' && resource !== 'transactions' && !assets.length)}>{documentAnalyzing ? 'OCR läuft …' : busy ? 'Wird gespeichert …' : 'Speichern'}</button></footer>
      </form>
    </section>
  </div>;
}
