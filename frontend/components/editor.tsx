'use client';
import { useState } from 'react';
import AddressMap from './address-map';
import { FileText, X } from 'lucide-react';
import { api, billingCycles, categories, conditions, json, kinds, Row, statuses, today, workKinds } from '../lib/data';

type Props = { resource: string; row?: Row; assets: Row[]; components: Row[]; documents: Row[]; defaultKind?: string; defaultAssetId?: string; defaultDueDate?: string; close: () => void; saved: () => Promise<void> };
export default function Editor({ resource, row, assets, components, documents, defaultKind, defaultAssetId, defaultDueDate, close, saved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [assetId, setAssetId] = useState(String(row?.asset_id || defaultAssetId || assets[0]?.id || ''));
  const [assetKind, setAssetKind] = useState(String(row?.kind || 'building'));
  const [propertyId, setPropertyId] = useState(String(row?.property_id || ''));
  const [location, setLocation] = useState(String(row?.location || ''));
  const [workKind, setWorkKind] = useState(String(row?.kind || defaultKind || 'task'));
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
        const savedDocument = await api<Row>('documents/upload', { method: 'POST', body: data });
        if (data.get('auto_match') === 'on') await api(`documents/${savedDocument.id}/suggest-asset`, { method: 'POST' });
      } else {
        const body: Record<string, unknown> = Object.fromEntries(data.entries());
        if (resource === 'transactions') {
          body.amount_cents = Math.round(Number(String(body.amount).replace(',', '.')) * 100); delete body.amount;
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
  return <div className="overlay" onClick={e => { if (e.target === e.currentTarget && !busy) close(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="editor-title" className="modal">
      <header><div><span className="eyebrow">BESTAND VERWALTEN</span><h2 id="editor-title">{row ? 'Eintrag bearbeiten' : resource === 'documents' ? 'Dokument hochladen' : resource === 'contracts' ? 'Vertrag anlegen' : resource === 'notification-recipients' ? 'Empfänger anlegen' : 'Neuen Eintrag anlegen'}</h2></div><button className="icon-button" aria-label="Schließen" onClick={close} disabled={busy}><X size={20}/></button></header>
      <form onSubmit={submit}>
        <div className="form-grid">
          {resource === 'assets' ? <>{input('name', 'Bezeichnung')}<label>Bereich<select name="kind" value={assetKind} onChange={event => setAssetKind(event.target.value)}>{Object.entries(kinds).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>{assetKind === 'vehicle' ? <><label className="span-two">Standort / Stellplatz <input name="location" value={location} onChange={e => setLocation(e.target.value)} placeholder="Garage, Stellplatz oder Standort" maxLength={300}/></label><label className="span-two">Zugeordnet zu Immobilie <select name="property_id" value={propertyId} onChange={e => setPropertyId(e.target.value)}><option value="">Keine Zuordnung</option>{assets.filter(asset => asset.id !== row?.id && asset.kind !== 'vehicle').map(asset => <option value={asset.id} key={asset.id}>{asset.name}{asset.location ? ` · ${asset.location}` : ''}</option>)}</select><small>Ordne das Fahrzeug dem passenden Gebäude, Grundstück oder technischen Standort zu.</small></label></> : <><label className="span-two">Standort / Adresse<input name="location" value={location} onChange={e => setLocation(e.target.value)} placeholder="Straße, Hausnummer, Ort" maxLength={300}/></label><div className="span-two"><AddressMap address={location}/></div></>}{select('condition', 'Zustand', conditions, 'good')}<label className="span-two upload-field">Bild für die Asset-Karte <input name="cover_image" type="file" accept=".png,.jpg,.jpeg,.webp"/><small>PNG, JPG oder WEBP · maximal 10 MB. Das Bild wird mit deinen Dokumenten gesichert.</small></label><div className="span-two form-subheading">Ansprechperson <small>Halter, Fahrer oder zuständiger Kontakt</small></div>{input('contact_first_name', 'Vorname', 'text', '', false)}{input('contact_last_name', 'Nachname', 'text', '', false)}{input('contact_birth_date', 'Geburtsdatum', 'date', '', false)}</> : resource === 'notification-recipients' ? <>{select('channel', 'Kanal', { telegram: 'Telegram' }, 'telegram')}{input('label', 'Name / Bezeichnung')}{input('address', 'Telegram Chat-ID') }<label className="span-two"><span>Empfang aktiv</span><input name="active" type="checkbox" defaultChecked={row ? String(row.active) !== 'false' : true}/></label><div className="span-two form-subheading">Erinnerungstypen</div><label className="check-field"><input name="notify_contracts" type="checkbox" defaultChecked={row ? String(row.notify_contracts) !== 'false' : true}/>Vertragsende</label><label className="check-field"><input name="notify_documents" type="checkbox" defaultChecked={row ? String(row.notify_documents) !== 'false' : true}/>Dokumente und Steuern</label><label className="check-field"><input name="notify_work_items" type="checkbox" defaultChecked={row ? String(row.notify_work_items) !== 'false' : true}/>Wartungen und Aufgaben</label></> : <>
            <label>Asset<select name="asset_id" value={assetId} onChange={e => setAssetId(e.target.value)} required>{!assets.length && <option value="">Bitte zuerst ein Asset anlegen</option>}{assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            {input(resource === 'components' ? 'name' : 'title', resource === 'components' ? 'Bezeichnung' : resource === 'contracts' ? 'Vertragsname' : resource === 'documents' ? 'Dokumentbezeichnung' : resource === 'transactions' ? 'Buchungsbezeichnung' : workKind === 'maintenance' ? 'Welche Wartung?' : workKind === 'defect' ? 'Welcher Mangel?' : 'Was ist zu erledigen?')}
          </>}
          {resource === 'components' && select('kind', 'Art', { room: 'Raum', area: 'Bereich', component: 'Komponente' }, 'component')}
          {resource === 'work-items' && <>
            <label>Art<select name="kind" value={workKind} onChange={e => setWorkKind(e.target.value)}>{Object.entries(workKinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Raum / Komponente<select key={assetId} name="component_id" defaultValue={value('component_id')}><option value="">Gesamtes Asset</option>{components.filter(c => c.asset_id === assetId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            {input('due_date', 'Fällig am', 'date', defaultDueDate || today())}{select('status', 'Status', statuses, 'open')}{workKind === 'maintenance' ? <input type="hidden" name="priority" value="normal"/> : select('priority', 'Priorität', { low: 'Niedrig', normal: 'Normal', high: 'Hoch', critical: 'Kritisch', urgent: 'Kritisch (bestehend)' }, 'normal')}
            {(workKind === 'maintenance' || workKind === 'tax_return') ? <label>Wiederholung in Tagen <input name="interval_days" type="number" min="1" max="3650" defaultValue={value('interval_days', workKind === 'tax_return' ? '365' : '')}/><small>Für die jährliche Steuererklärung: 365 Tage.</small></label> : <input type="hidden" name="interval_days" value=""/>}
          </>}
          {resource === 'transactions' && <>
            {select('direction', 'Buchungsart', { income: 'Einnahme', expense: 'Ausgabe' }, 'expense')}
            <label>Betrag in EUR<input name="amount" type="number" min="0.01" step="0.01" max="20000000" required defaultValue={row ? Number(row.amount_cents) / 100 : ''}/></label>
            {input('booked_date', 'Datum', 'date', today())}{select('category', 'Kategorie', categories, 'other')}
          </>}
          {resource === 'documents' && <>
            {input('document_date', 'Dokumentdatum', 'date', today())}{select('category', 'Kategorie', categories, 'other')}
            {input('reminder_date', 'Erinnerung am (optional)', 'date', '', false)}<label>Erinnerung vorher (Tage)<input name="reminder_days" type="number" min="0" max="365" defaultValue={value('reminder_days', '30')}/></label>
            {!row && <><label className="span-two upload-field">Datei auswählen<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx" required/><small>PDF, Bilder oder Dokumente · maximal 25 MB. Fotos und Scans vom Smartphone sind möglich.</small></label><label className="span-two check-field"><input name="auto_match" type="checkbox" defaultChecked/>Objekt anhand von Adresse, Objektname und Kontaktangaben automatisch vorschlagen</label></>}
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
          <label className="span-two">Notizen<textarea name="notes" rows={3} maxLength={10000} defaultValue={value('notes')} placeholder="Zusätzliche Informationen …"/></label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <footer><button type="button" className="secondary" onClick={close} disabled={busy}>Abbrechen</button><button className="primary" disabled={busy || (resource !== 'assets' && resource !== 'notification-recipients' && !assets.length)}>{busy ? 'Wird gespeichert …' : 'Speichern'}</button></footer>
      </form>
    </section>
  </div>;
}
