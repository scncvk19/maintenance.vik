import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'maintenance.vik · Alles im Blick', description: 'Gebäude, Fahrzeuge und Anlagen an einem Ort verwalten.' };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}
