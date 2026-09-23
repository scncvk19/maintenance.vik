'use client';

import Image from 'next/image';
import { Building2, CalendarDays, CarFront, CircleDollarSign, Eye, FileText, Factory, LandPlot, Layers3, MapPin, Plus, UserRound, X } from 'lucide-react';
import { billingCycles, categories, conditions, day, kinds, money, Row, transactionCategories, workKinds } from '../lib/data';

type Props = {
  asset: Row;
  components: Row[];
  workItems: Row[];
  documents: Row[];
  contracts: Row[];
  transactions: Row[];
  close: () => void;
  edit: () => void;
  create: (resource: 'work-items' | 'documents' | 'contracts', defaultKind?: string) => void;
};

export default function AssetDetail({ asset, components, workItems, documents, contracts, transactions, close, edit, create }: Props) {
  const Icon = asset.kind === 'building' ? Building2 : asset.kind === 'vehicle' ? CarFront : asset.kind === 'property' ? LandPlot : Factory;
  const assetWorkItems = workItems.filter(item => item.asset_id === asset.id).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  const assetDocuments = documents.filter(document => document.asset_id === asset.id).sort((a, b) => String(b.document_date).localeCompare(String(a.document_date)));
  const expense = transactions.filter(item => item.asset_id === asset.id && item.direction === 'expense').reduce((sum, item) => sum + Number(item.amount_cents), 0);
  const income = transactions.filter(item => item.asset_id === asset.id && item.direction === 'income').reduce((sum, item) => sum + Number(item.amount_cents), 0);
  const recurringMonthly = contracts.reduce((sum, item) => sum + Number(item.amount_cents) / (item.billing_cycle === 'yearly' ? 12 : 1), 0);
  const contact = [asset.contact_first_name, asset.contact_last_name].filter(Boolean).join(' ');
  return <div className="overlay asset-detail-overlay" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="asset-detail" role="dialog" aria-modal="true" aria-labelledby="asset-detail-title">
      <header className="asset-detail-head">
        <div className={`asset-detail-art ${asset.kind}`}>{asset.cover_document_id ? <Image src={`/api/assets/${asset.id}/image`} alt="" fill unoptimized sizes="560px"/> : <Icon size={54}/>}</div>
        <div className="asset-detail-title"><span className="eyebrow">{kinds[String(asset.kind)]}</span><h2 id="asset-detail-title">{asset.name}</h2><p><MapPin size={14}/>{asset.location || 'Kein Standort hinterlegt'}</p><span className={`badge ${asset.condition}`}>{conditions[String(asset.condition)]}</span></div>
        <button className="icon-button" aria-label="Asset-Details schließen" onClick={close}><X size={20}/></button>
      </header>
      <div className="asset-quick-actions">{asset.kind === 'vehicle' && <button className="secondary" onClick={edit}><FileText size={16}/>Foto ändern</button>}<button className="secondary" onClick={() => create('work-items', 'task')}><Plus size={16}/>Aufgabe</button><button className="secondary" onClick={() => create('work-items', 'maintenance')}><CalendarDays size={16}/>Wartung</button><button className="secondary" onClick={() => create('documents')}><FileText size={16}/>Dokument</button><button className="secondary" onClick={() => create('contracts')}><CircleDollarSign size={16}/>Verträge</button></div>
      <div className="asset-detail-grid">
        <section className="detail-card"><h3><UserRound size={17}/>Ansprechperson</h3><strong>{contact || 'Nicht hinterlegt'}</strong>{asset.contact_birth_date && <small>Geboren am {day(asset.contact_birth_date)}</small>}{asset.notes && <p>{asset.notes}</p>}</section>
        <section className="detail-card"><h3><CircleDollarSign size={17}/>Kostenübersicht</h3><div className="cost-grid"><span><small>Bisherige Ausgaben</small><b className="negative">{money(expense)}</b></span><span><small>Einnahmen</small><b className="positive">{money(income)}</b></span><span><small>Laufende Verträge / Monat</small><b>{money(Math.round(recurringMonthly))}</b></span></div></section>
        {asset.kind !== 'vehicle' && <section className="detail-card span-two"><h3><Layers3 size={17}/>Räume & Komponenten <small>{components.length}</small></h3>{components.length ? <div className="compact-list">{components.map(item => <span key={item.id}>{item.name}<small>{item.kind === 'room' ? 'Raum' : item.kind === 'floor' ? 'Etage' : item.kind === 'area' ? 'Bereich' : 'Komponente'}</small></span>)}</div> : <p>Noch keine Räume oder Komponenten angelegt.</p>}</section>}
        <section className="detail-card span-two"><h3><CalendarDays size={17}/>Aufgaben, Mängel & Wartungen <small>{assetWorkItems.length}</small></h3>{assetWorkItems.length ? <div className="compact-list">{assetWorkItems.map(item => <span key={item.id}><b>{item.title}</b><small>{workKinds[String(item.kind)]} · {day(item.due_date)} · {item.status === 'done' ? 'Erledigt' : 'Offen'}</small></span>)}</div> : <p>Keine Aufgaben oder Wartungen hinterlegt.</p>}</section>
        <section className="detail-card"><h3><CircleDollarSign size={17}/>Verträge <small>{contracts.length}</small></h3>{contracts.length ? <div className="compact-list">{contracts.map(item => <span key={item.id}><b>{item.title}</b><small>{money(Number(item.amount_cents))} / {billingCycles[String(item.billing_cycle)]} · bis {day(item.end_date)}</small></span>)}</div> : <p>Keine Verträge hinterlegt.</p>}</section>
        <section className="detail-card"><h3><FileText size={17}/>Dokumente <small>{assetDocuments.length}</small></h3>{assetDocuments.length ? <div className="compact-list">{assetDocuments.map(item => <a href={`/api/documents/${item.id}/preview`} target="_blank" rel="noreferrer" key={item.id}><Eye size={15}/><span><b>{item.title}</b><small>{categories[String(item.category)]} · {day(item.document_date)}</small></span></a>)}</div> : <p>Keine Dokumente hinterlegt.</p>}</section>
        <section className="detail-card span-two"><h3><CircleDollarSign size={17}/>Finanzeinträge <small>{transactions.filter(item => item.asset_id === asset.id).length}</small></h3>{transactions.filter(item => item.asset_id === asset.id).length ? <div className="compact-list">{transactions.filter(item => item.asset_id === asset.id).sort((a, b) => String(b.booked_date).localeCompare(String(a.booked_date))).map(item => <span key={item.id}><b>{item.title}</b><small>{day(item.booked_date)} · {transactionCategories[String(item.category)]} · {item.direction === 'income' ? '+' : '−'}{money(Number(item.amount_cents))}</small></span>)}</div> : <p>Keine Einnahmen oder Ausgaben hinterlegt.</p>}</section>
      </div>
    </section>
  </div>;
}
