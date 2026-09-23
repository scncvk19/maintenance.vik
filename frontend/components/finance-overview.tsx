'use client';

import { useState } from 'react';
import { CircleDollarSign, FileText, Plus, TrendingDown, TrendingUp, WalletCards } from 'lucide-react';
import { billingCycles, day, money, Row, transactionCategories } from '../lib/data';

type Props = {
  assets: Row[];
  transactions: Row[];
  contracts: Row[];
  onCreateIncome: (assetId?: string) => void;
  onCreateExpense: (assetId?: string) => void;
  onCreateContract: (assetId?: string) => void;
  onEditTransaction: (row: Row) => void;
  onEditContract: (row: Row) => void;
};

function assetLabel(asset: Row | undefined, assets: Row[]) {
  if (!asset) return 'Unbekanntes Asset';
  const parent = asset.property_id ? assets.find(item => item.id === asset.property_id) : undefined;
  const place = parent ? `${parent.name}${parent.location ? ` · ${parent.location}` : ''}` : asset.location || '';
  return place ? `${asset.name} · ${place}` : String(asset.name);
}

export default function FinanceOverview({ assets, transactions, contracts, onCreateIncome, onCreateExpense, onCreateContract, onEditTransaction, onEditContract }: Props) {
  const [assetFilter, setAssetFilter] = useState('');
  const selectedAsset = assets.find(asset => String(asset.id) === assetFilter);
  const filteredTransactions = assetFilter ? transactions.filter(row => String(row.asset_id) === assetFilter) : transactions;
  const filteredContracts = assetFilter ? contracts.filter(row => String(row.asset_id) === assetFilter) : contracts;
  const month = new Date().toLocaleDateString('sv-SE').slice(0, 7);
  const monthTransactions = filteredTransactions.filter(row => String(row.booked_date || '').startsWith(month));
  const monthIncome = monthTransactions.filter(row => row.direction === 'income').reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  const monthExpense = monthTransactions.filter(row => row.direction === 'expense').reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  const monthBalance = monthIncome - monthExpense;
  const recurringMonthly = filteredContracts.reduce((sum, row) => sum + (row.billing_cycle === 'yearly' ? Number(row.amount_cents || 0) / 12 : Number(row.amount_cents || 0)), 0);

  const assetTotals = assets.map(asset => {
    const relatedTransactions = transactions.filter(row => row.asset_id === asset.id);
    const income = relatedTransactions.filter(row => row.direction === 'income').reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
    const expense = relatedTransactions.filter(row => row.direction === 'expense').reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
    const recurring = contracts.filter(row => row.asset_id === asset.id).reduce((sum, row) => sum + (row.billing_cycle === 'yearly' ? Number(row.amount_cents || 0) / 12 : Number(row.amount_cents || 0)), 0);
    return { asset, income, expense, recurring };
  }).filter(item => item.income || item.expense || item.recurring);

  const recentTransactions = [...filteredTransactions].sort((a, b) => String(b.booked_date || '').localeCompare(String(a.booked_date || ''))).slice(0, 8);
  const activeContracts = [...filteredContracts].sort((a, b) => String(a.end_date || '').localeCompare(String(b.end_date || ''))).slice(0, 8);

  return <div className="finance-overview">
    <section className="panel finance-filter-panel"><div><span className="eyebrow">OBJEKTFILTER</span><h2>{selectedAsset ? selectedAsset.name : 'Alle Objekte'}</h2><p>{selectedAsset ? assetLabel(selectedAsset, assets) : 'Gesamtübersicht über alle Immobilien, Grundstücke, Fahrzeuge und Anlagen.'}</p></div><label>Objekt auswählen<select value={assetFilter} onChange={e => setAssetFilter(e.target.value)}><option value="">Alle Objekte</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}{asset.location ? ` · ${asset.location}` : ''}</option>)}</select></label></section>
    <div className="finance-actions">
      <button className="primary" onClick={() => onCreateIncome(assetFilter || undefined)}><TrendingUp size={17}/>Einnahme anlegen</button>
      <button className="secondary" onClick={() => onCreateExpense(assetFilter || undefined)}><TrendingDown size={17}/>Ausgabe anlegen</button>
      <button className="secondary" onClick={() => onCreateContract(assetFilter || undefined)}><FileText size={17}/>Vertrag anlegen</button>
    </div>

    <div className="finance-kpis">
      <article className="finance-kpi"><span><TrendingUp size={18}/>Einnahmen diesen Monat</span><strong className="positive">{money(monthIncome)}</strong></article>
      <article className="finance-kpi"><span><TrendingDown size={18}/>Ausgaben diesen Monat</span><strong className="negative">{money(monthExpense)}</strong></article>
      <article className="finance-kpi"><span><WalletCards size={18}/>Monatlicher Saldo</span><strong className={monthBalance >= 0 ? 'positive' : 'negative'}>{money(monthBalance)}</strong></article>
      <article className="finance-kpi"><span><CircleDollarSign size={18}/>Verträge pro Monat</span><strong>{money(Math.round(recurringMonthly))}</strong><small>Jahresverträge anteilig / 12</small></article>
    </div>

    <div className="finance-grid">
      <section className="panel finance-panel">
        <div className="panel-heading"><div><h2>Letzte Buchungen</h2><p>Einnahmen und Ausgaben für die aktuelle Auswahl</p></div></div>
        {recentTransactions.length ? <div className="finance-list">{recentTransactions.map(row => {
          const asset = assets.find(item => item.id === row.asset_id);
          return <button key={row.id} onClick={() => onEditTransaction(row)}>
            <span><strong>{row.title}</strong><small>{assetLabel(asset, assets)} · {transactionCategories[String(row.category)] || 'Sonstiges'} · {day(row.booked_date)}</small></span>
            <b className={row.direction === 'income' ? 'positive' : 'negative'}>{row.direction === 'income' ? '+' : '−'}{money(Number(row.amount_cents || 0))}</b>
          </button>;
        })}</div> : <div className="empty compact"><p>Noch keine Buchungen vorhanden.</p></div>}
      </section>

      <section className="panel finance-panel">
        <div className="panel-heading"><div><h2>Laufende Verträge</h2><p>Wiederkehrende Kosten für die aktuelle Auswahl</p></div></div>
        {activeContracts.length ? <div className="finance-list">{activeContracts.map(row => {
          const asset = assets.find(item => item.id === row.asset_id);
          return <button key={row.id} onClick={() => onEditContract(row)}>
            <span><strong>{row.title}</strong><small>{assetLabel(asset, assets)} · {row.provider || 'Kein Anbieter'} · bis {day(row.end_date)}</small></span>
            <b>{money(Number(row.amount_cents || 0))} / {billingCycles[String(row.billing_cycle)]}</b>
          </button>;
        })}</div> : <div className="empty compact"><p>Noch keine Verträge vorhanden.</p></div>}
      </section>
    </div>

    <section className="panel finance-panel">
      <div className="panel-heading"><div><h2>Nach Standort / Immobilie</h2><p>Finanzwerte bleiben dem jeweiligen Asset und damit seinem Standort zugeordnet.</p></div></div>
      {assetTotals.length ? <div className="finance-assets">{assetTotals.map(({ asset, income, expense, recurring }) => <article key={asset.id}>
        <div><strong>{asset.name}</strong><small>{assetLabel(asset, assets).replace(String(asset.name) + ' · ', '') || 'Kein Standort hinterlegt'}</small></div>
        <span><small>Einnahmen</small><b className="positive">{money(income)}</b></span>
        <span><small>Ausgaben</small><b className="negative">{money(expense)}</b></span>
        <span><small>Verträge / Monat</small><b>{money(Math.round(recurring))}</b></span>
      </article>)}</div> : <div className="empty compact"><p>Noch keine Finanzdaten einem Asset zugeordnet.</p></div>}
    </section>
  </div>;
}
