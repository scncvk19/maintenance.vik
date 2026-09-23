'use client';

import { Map, Satellite } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type Props = { address: string };

export default function AddressMap({ address }: Props) {
  const [mode, setMode] = useState<'map' | 'satellite'>('map');
  const [query, setQuery] = useState(address.trim());

  useEffect(() => {
    const next = address.trim();
    if (!next) {
      setQuery('');
      return;
    }
    const timer = window.setTimeout(() => setQuery(next), 700);
    return () => window.clearTimeout(timer);
  }, [address]);

  const src = useMemo(() => query
    ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&t=${mode === 'satellite' ? 'k' : 'm'}&z=16&output=embed`
    : '', [mode, query]);

  return <div className="address-map" aria-label="Kartenansicht der Adresse">
    <div className="address-map-toolbar"><span>{query ? 'Adresse auf der Karte' : 'Adresse eingeben, um die Karte zu sehen'}</span><div className="map-mode"><button type="button" className={mode === 'map' ? 'selected' : ''} onClick={() => setMode('map')} disabled={!query}><Map size={14}/>Karte</button><button type="button" className={mode === 'satellite' ? 'selected' : ''} onClick={() => setMode('satellite')} disabled={!query}><Satellite size={14}/>Satellit</button></div></div>
    {src ? <iframe title={`Karte für ${query}`} src={src} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : <div className="address-map-empty"><Map size={24}/><span>Nach Eingabe einer Adresse wird die Position hier angezeigt.</span></div>}
    <small className="map-attribution">Kartendarstellung über Google Maps · Adresse bitte prüfen</small>
  </div>;
}
