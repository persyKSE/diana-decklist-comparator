import React from 'react';
import { useAppContext } from '../context/AppContext';
import { wilson } from '../utils/math';

const Analyze: React.FC = () => {
  const { globalDecks, meta, rankedCards, cardMeta, imageMap } = useAppContext();

  const N = globalDecks.length;

  const fieldBadge = (name: string) => {
    if (!meta || !meta.otherDecks || !meta.cardBase) return <span className="text-content-muted">—</span>;
    const pct = Math.round(100 * (meta.cardBase[name] || 0) / meta.otherDecks);
    if (pct >= 25) {
      return <span className="badge-neutral border-brand-accent/20 bg-brand-accent-bg text-brand-accent" title="Played across the wider field — a format staple, not a Diana choice">{pct}% · staple</span>;
    }
    if (pct <= 5) {
      return <span className="badge-neutral border-status-flex/20 bg-status-flex/10 text-status-flex" title="Barely played outside Diana — an archetype-defining choice">{pct}% · Diana tech</span>;
    }
    return <span className="badge-neutral">{pct}%</span>;
  };

  const prettyArchetype = (slug: string) => {
    return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-6 items-end pb-6 border-b border-surface-border">
        <img className="w-24 h-24 rounded-2xl object-cover shadow-sm" src="/cache/images/Diana_Lunari.webp" alt="Diana" />
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight m-0 text-content-heading">Analyze</h1>
          <p className="text-content max-w-2xl m-0 leading-relaxed">
            What the filtered field agrees and disagrees on: inclusion rates, card packages, curves, sub-archetypes, and shifts over time.
          </p>
        </div>
      </div>

      {meta && meta.otherDecks > 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-2xl font-bold m-0 text-content-heading mb-2">Meta context</h2>
            <p className="text-sm text-content-muted max-w-3xl">
              The whole scraped top-cut field ({(meta.otherDecks + (meta.archetypes?.[meta.diana] || 0))} decks, all archetypes) — how big a slice Diana is, per event and overall. This section ignores the filters above.
            </p>
          </div>
          
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {meta.archetypes && (() => {
              const topArch = Object.entries(meta.archetypes).sort((a: any, b: any) => b[1] - a[1]).slice(0, 10);
              if (!topArch.length) return null;
              const maxN: number = topArch[0][1] as number;
              const totalAll = meta.otherDecks + (meta.archetypes[meta.diana] || 0);
              return (
                <div className="glass-panel overflow-hidden">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-surface-muted border-b border-surface-border text-content-muted uppercase tracking-wider text-xs font-semibold">
                      <tr>
                        <th className="py-3 px-4">Archetype</th>
                        <th className="py-3 px-4">Top-cut decks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {topArch.map(([arch, n]: any) => {
                        const isDiana = arch === meta.diana;
                        return (
                          <tr key={arch} className={`hover:bg-surface-hover transition-colors ${isDiana ? 'bg-brand-accent-bg/30' : ''}`}>
                            <td className={`py-2 px-4 ${isDiana ? 'font-bold text-content-heading' : 'text-content'}`}>
                              {prettyArchetype(arch)}{isDiana && <span className="text-brand-accent ml-1">★</span>}
                            </td>
                            <td className="py-2 px-4 flex items-center gap-3">
                              <div className="w-32 h-1.5 rounded-full bg-surface-border overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${isDiana ? 'bg-brand-accent' : 'bg-content-muted'}`} 
                                  style={{ width: `${Math.round(100 * n / maxN)}%` }}
                                ></div>
                              </div>
                              <span className="font-mono text-xs">{n} <span className="text-content-muted">({Math.round(100 * n / totalAll)}%)</span></span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {meta.events && (() => {
              const evRows = meta.events.filter((e: any) => (Object.values(e.counts) as number[]).reduce((a, b) => a + b, 0) >= 3);
              if (!evRows.length) return null;
              return (
                <div className="glass-panel overflow-hidden">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-surface-muted border-b border-surface-border text-content-muted uppercase tracking-wider text-xs font-semibold">
                      <tr>
                        <th className="py-3 px-4">Event</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Diana share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {evRows.map((e: any, i: number) => {
                        const total: number = Object.values(e.counts).reduce((a: any, b: any) => a + b, 0) as number;
                        const dn = e.counts[meta.diana] || 0;
                        return (
                          <tr key={i} className="hover:bg-surface-hover transition-colors">
                            <td className="py-2 px-4 font-medium text-content">{e.name}</td>
                            <td className="py-2 px-4 text-content-muted">{e.date || '—'}</td>
                            <td className="py-2 px-4 flex items-center gap-3">
                              <div className="w-24 h-1.5 rounded-full bg-surface-border overflow-hidden">
                                <div 
                                  className="h-full rounded-full bg-brand-accent opacity-80" 
                                  style={{ width: `${Math.round(100 * dn / total)}%` }}
                                ></div>
                              </div>
                              <span className="font-mono text-xs">{dn}/{total} <span className="text-content-muted">({Math.round(100 * dn / total)}%)</span></span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold m-0 text-content-heading mb-2">Card inclusion across winning decks</h2>
          <p className="text-sm text-content-muted max-w-4xl">
            Every card seen in the Diana field: how many decks run it, at what counts. The small grey range under each percentage is the <strong>Wilson 95% interval</strong> — on {N} decks, 12/13 really means "somewhere around 65–99%", so don't over-read a single point estimate. The Field column is the card's play rate across all other archetypes — high means format staple, low means Diana-specific tech.
          </p>
        </div>

        {N > 0 && rankedCards.length > 0 ? (
          <div className="glass-panel overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-surface-muted border-b border-surface-border text-content-muted uppercase tracking-wider text-xs font-semibold">
                <tr>
                  <th className="py-3 px-4">Card</th>
                  <th className="py-3 px-4 text-center">Cost</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Inclusion</th>
                  <th className="py-3 px-4 text-right">Avg copies</th>
                  <th className="py-3 px-4">Copy counts</th>
                  <th className="py-3 px-4">Field</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {rankedCards.map((c) => {
                  const cmeta = cardMeta[c.name] || {};
                  const pct = Math.round(100 * c.decksIn / N);
                  const distBadges = (Object.entries(c.dist) as [string, number][]).sort((a, b) => Number(b[0]) - Number(a[0])).map(([copies, nD]) => (
                    <span key={copies} className="badge-neutral mr-1.5 mb-1.5">x{copies} in {nD} {nD > 1 ? 'decks' : 'deck'}</span>
                  ));
                  const [lo, hi] = wilson(c.decksIn, N);
                  
                  return (
                    <tr key={c.name} className="hover:bg-surface-hover transition-colors group cursor-pointer">
                      <td className="py-2 px-4 flex items-center gap-3 font-medium text-content-heading">
                        {imageMap[c.name] ? (
                          <img src={imageMap[c.name]} alt={c.name} className="w-8 h-8 object-cover rounded shadow-sm border border-surface-border" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-surface-muted border border-surface-border flex items-center justify-center text-[10px] text-content-muted">?</div>
                        )}
                        {c.name}
                      </td>
                      <td className="py-2 px-4 text-center">
                        {cmeta.cost != null ? (
                          <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-surface-muted border border-surface-border font-bold text-xs shadow-sm">
                            {cmeta.cost}
                          </span>
                        ) : <span className="text-content-muted">—</span>}
                      </td>
                      <td className="py-2 px-4 text-content-muted">{cmeta.type || '—'}</td>
                      <td className="py-2 px-4" title={`Wilson 95% interval on ${c.decksIn}/${N}: ${lo.toFixed(0)}–${hi.toFixed(0)}%`}>
                        <div className="flex flex-col gap-1 w-40">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-content-heading">{c.decksIn}/{N}</span>
                            <span className="text-content-muted">{pct}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-surface-border relative overflow-hidden">
                            <div 
                              className="absolute top-0 bottom-0 left-0 bg-brand-accent" 
                              style={{ width: `${pct}%` }}
                            ></div>
                            <div 
                              className="absolute top-0 bottom-0 bg-white/20 dark:bg-black/20" 
                              style={{ left: `${lo}%`, width: `${hi - lo}%` }}
                            ></div>
                          </div>
                          <div className="text-[10px] text-content-muted font-mono leading-none flex justify-between px-1">
                            <span>{lo.toFixed(0)}</span>
                            <span>{hi.toFixed(0)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-4 text-right font-mono text-content-heading font-medium">{c.avgCopies.toFixed(1)}</td>
                      <td className="py-2 px-4"><div className="flex flex-wrap pt-1">{distBadges as React.ReactNode}</div></td>
                      <td className="py-2 px-4">{fieldBadge(c.name)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center border-2 border-dashed border-surface-border rounded-xl text-content-muted bg-surface-hover/50">
            No cards to analyze.
          </div>
        )}
      </div>
    </div>
  );
};

export default Analyze;
