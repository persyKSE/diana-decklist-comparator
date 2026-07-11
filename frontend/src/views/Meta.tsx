import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { threatWeights, archConversion, archTrend, regionOf } from '../utils/metaMath';
import type { FieldModel } from '../utils/metaMath';
import { pct } from '../utils/math';

const FIELD_HALF_LIFE_DAYS = 30;

const Meta: React.FC = () => {
  const { field, meta } = useAppContext();
  const [fieldModel, setFieldModel] = useState<FieldModel>({ recency: false, region: null });

  const tw = useMemo(() => threatWeights(field, meta, fieldModel), [field, meta, fieldModel]);

  if (!field || !field.archetypes) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex gap-6 items-end pb-6 border-b border-surface-border">
          <img className="w-24 h-24 rounded-2xl object-cover shadow-sm" src="/cache/images/Diana_Lunari.webp" alt="Diana" />
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-bold tracking-tight m-0 text-content-heading">Meta</h1>
          </div>
        </div>
        <div className="p-8 text-center border-2 border-dashed border-surface-border rounded-xl text-content-muted bg-surface-hover/50">
          No field data found.
        </div>
      </div>
    );
  }

  const regions = [...new Set(Object.values(field.archetypes).flatMap((a: any) => a.decks.map((d: any) => regionOf(d.event))))]
    .filter(r => r !== 'Other')
    .sort() as string[];

  const weights = tw.rows;
  const dianaN = field.archetypes[field.diana] ? field.archetypes[field.diana].decks.length : 0;
  const totalAll = Object.values(field.archetypes).reduce((a: number, x: any) => a + x.decks.length, 0);
  const maxW = weights.length ? weights[0].weight : 1;

  const dConv = archConversion(field.diana, field, meta);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-6 items-end pb-6 border-b border-surface-border">
        <img className="w-24 h-24 rounded-2xl object-cover shadow-sm" src="/cache/images/Diana_Lunari.webp" alt="Diana" />
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight m-0 text-content-heading">Meta</h1>
          <p className="text-content max-w-2xl m-0 leading-relaxed">
            Every archetype in the scraped field — what they play, how often they convert, and how well your sideboard answers them. Reads the whole field, so the Build/Analyze filters do not apply here.
          </p>
        </div>
      </div>

      <div className="glass-panel p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-content-muted uppercase tracking-wider">Prep for</span>
          
          <div className="flex bg-surface-muted border border-surface-border rounded-lg p-0.5">
            <button 
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${!fieldModel.recency ? 'bg-surface shadow-sm text-content-heading' : 'text-content-muted hover:text-content'}`}
              onClick={() => setFieldModel(m => ({ ...m, recency: false }))}
              title="Every scraped list counts equally"
            >
              All time
            </button>
            <button 
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${fieldModel.recency ? 'bg-brand-accent text-white shadow-sm' : 'text-content-muted hover:text-content'}`}
              onClick={() => setFieldModel(m => ({ ...m, recency: true }))}
              title={`Exponential decay: a list from ${FIELD_HALF_LIFE_DAYS} days before the latest event counts half`}
            >
              Recent form
            </button>
          </div>
          
          <div className="w-px h-6 bg-surface-border mx-1"></div>
          
          <div className="flex flex-wrap gap-1.5">
            {regions.map(r => (
              <button 
                key={r} 
                className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${fieldModel.region === r ? 'bg-brand-accent-bg border-brand-accent/30 text-brand-accent' : 'bg-surface-muted border-transparent text-content-muted hover:bg-surface-border hover:text-content'}`}
                onClick={() => setFieldModel(m => ({ ...m, region: m.region === r ? null : r }))} 
                title={`Only decks from ${r} events`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        
        <div className="text-sm px-2 pt-3 border-t border-surface-border text-content-muted">
          {tw.modelOn ? (
            <div className="flex flex-wrap gap-2 items-center">
              <span>Model: <strong className="text-content-heading">{fieldModel.recency ? `recent form (half-life ${FIELD_HALF_LIFE_DAYS} days)` : ''}{fieldModel.recency && fieldModel.region ? ', ' : ''}{fieldModel.region ? `${fieldModel.region} events only` : ''}</strong></span>
              <span className="w-1 h-1 rounded-full bg-surface-border"></span>
              <span>Effective sample <strong className="font-mono">{tw.effN.toFixed(1)}</strong> of {tw.rawN} lists</span>
              {tw.effN < 25 && (
                <>
                  <span className="w-1 h-1 rounded-full bg-status-danger"></span>
                  <span className="text-status-danger font-medium">Thin slice — shares are noisy</span>
                </>
              )}
            </div>
          ) : (
            <span>All {tw.rawN} scraped lists, unweighted — turn on <strong className="text-content-heading">recent form</strong> or a region to prep for a specific field.</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold m-0 text-content-heading mb-2">The field</h2>
          <p className="text-sm text-content-muted max-w-4xl">
            Every archetype scraped from the same top cuts as the Diana lists — {totalAll} decks across {Object.keys(field.archetypes).length} archetypes. <strong>Threat</strong> is field share × Day 1→Day 2 conversion index: how much of what you will actually face, weighted by how often it survives. Shares are of the whole field (Diana included) under the model above.
          </p>
        </div>

        {dConv && (
          <div className="bg-brand-accent-bg border border-brand-accent/20 rounded-xl p-4 text-sm text-content">
            You are <strong className="text-brand-accent">Diana</strong>: {dianaN} top-cut lists here, converting <strong className="text-brand-accent">{(100 * dConv.conversion).toFixed(1)}%</strong> into Day 2 — <strong className="text-brand-accent">{dConv.index.toFixed(2)}×</strong> the field average. The table below is everyone else.
          </div>
        )}

        <div className="glass-panel overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-surface-muted border-b border-surface-border text-content-muted uppercase tracking-wider text-xs font-semibold">
              <tr>
                <th className="py-3 px-4">Archetype</th>
                <th className="py-3 px-4 text-right">Top-cut decks</th>
                <th className="py-3 px-4 text-right">Field share</th>
                <th className="py-3 px-4 text-right">Conversion</th>
                <th className="py-3 px-4 text-right">vs field</th>
                <th className="py-3 px-4">Trend</th>
                <th className="py-3 px-4 w-48">Threat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {weights.map(w => {
                const a = field.archetypes[w.slug];
                const t = archTrend(w.slug, field, meta);
                
                let trendNode = <span className="text-content-muted">—</span>;
                if (t) {
                  if (Math.abs(t.delta) < 0.01) {
                    trendNode = <span className="text-content-muted flex items-center gap-1"><span className="w-3 h-0.5 bg-current"></span> flat</span>;
                  } else if (t.delta > 0) {
                    trendNode = <span className="text-status-lock flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg> {pct(t.early)} → {pct(t.late)}</span>;
                  } else {
                    trendNode = <span className="text-status-danger flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg> {pct(t.early)} → {pct(t.late)}</span>;
                  }
                }

                return (
                  <tr key={w.slug} className="hover:bg-surface-hover transition-colors group cursor-pointer">
                    <td className="py-3 px-4 font-bold text-content-heading">{a.name}</td>
                    <td className="py-3 px-4 text-right font-mono text-content-heading">
                      {w.n} 
                      {fieldModel.recency && <span className="text-xs text-content-muted ml-1 font-normal">(eff {w.effN.toFixed(1)})</span>}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{pct(w.share)}</td>
                    <td className="py-3 px-4 text-right font-mono">{w.conv ? `${(100 * w.conv.conversion).toFixed(1)}%` : '—'}</td>
                    <td className={`py-3 px-4 text-right font-mono font-medium ${w.conv && w.conv.index >= 1 ? 'text-status-lock' : 'text-content-muted'}`}>
                      {w.conv ? `${w.conv.index.toFixed(2)}×` : '—'}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono">{trendNode}</td>
                    <td className="py-3 px-4">
                      <div className="w-full h-2 rounded-full bg-surface-border overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-brand-accent transition-all duration-500" 
                          style={{ width: `${Math.round(100 * w.weight / maxW)}%` }}
                        ></div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-content-muted max-w-4xl">
          Conversion is archetype-level across {meta?.performance?.fieldDay1?.toLocaleString() || 0} recorded decks; a dash means that legend never cleared the 20-deck minimum. Trend compares the last three events to everything before them (unweighted) and needs at least four events.
        </p>
      </div>
    </div>
  );
};

export default Meta;
