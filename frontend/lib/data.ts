export type Row = { id: string; [key: string]: string | number | null };
export type Dashboard = { income_cents: number; expense_cents: number; balance_cents: number; asset_count: number; overdue: number; maintenance_due: number; conditions: Record<string, number>; upcoming: Row[]; period: string };
export const kinds: Record<string, string> = { building: 'Gebäude', vehicle: 'Fahrzeug', equipment: 'Technische Anlage', property: 'Grundstück' };
export const conditions: Record<string, string> = { good: 'Gut', attention: 'Beobachten', critical: 'Kritisch' };
export const statuses: Record<string, string> = { open: 'Offen', in_progress: 'In Arbeit', done: 'Erledigt' };
export const categories: Record<string, string> = { energy: 'Energie', tax: 'Steuer', insurance: 'Versicherung', maintenance: 'Wartung', repair: 'Reparatur', invoice: 'Rechnung', rent: 'Miete', other: 'Sonstiges' };
export const billingCycles: Record<string, string> = { monthly: 'Monatlich', yearly: 'Jährlich' };
export const workKinds: Record<string, string> = { maintenance: 'Wartung', task: 'Aufgabe', defect: 'Mangel', appointment: 'Termin', tax_return: 'Steuererklärung' };
export const money = (cents: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
export const day = (value: string | number | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('de-DE') : '–';
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, options);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.detail === 'string' ? data.detail : data.detail ? JSON.stringify(data.detail) : 'Die Aktion konnte nicht abgeschlossen werden.');
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
