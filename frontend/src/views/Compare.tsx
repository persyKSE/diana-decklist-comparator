import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { distanceMatrix, diffSection } from '../utils/deckMath';

const Compare: React.FC = () => {
  const { globalDecks, imageMap } = useAppContext();
  const N = globalDecks.length;

  const [diffA, setDiffA] = useState<number>(0);
  const [diffB, setDiffB] = useState<number>(1);

  const { distances, avgDistances } = useMemo(() => {
    if (N < 2) return { distances: [], avgDistances: [] };
    const dists = distanceMatrix(globalDecks);
    const avgs = dists.map(row => row.reduce((a, b) => a + b, 0) / (N - 1));
    return { distances: dists, avgDistances: avgs };
  }, [globalDecks, N]);

  if (N < 2) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex gap-6 items-end pb-6 border-b border-surface-border">
          <img className="w-24 h-24 rounded-2xl object-cover shadow-sm" src="/cache/images/Diana_Lunari.webp" alt="Diana" />
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-bold tracking-tight m-0 text-content-heading">Compare</h1>
          </div>
        </div>
        <div className="p-8 text-center border-2 border-dashed border-surface-border rounded-xl text-content-muted bg-surface-hover/50 max-w-2xl mx-auto">
          Need at least two decks in the filter to compare. Reset filters in the sidebar.
        </div>
      </div>
    );
  }

  const deckA = globalDecks[diffA];
  const deckB = globalDecks[diffB];

  const sections = [
    { title: 'Main deck', diff: diffSection(deckA.cards, deckB.cards) },
    { title: 'Sideboard', diff: diffSection(deckA.sideboard, deckB.sideboard) },
    { title: 'Runes', diff: diffSection(deckA.runes, deckB.runes) },
    { title: 'Battlefields', diff: diffSection(deckA.battlefields, deckB.battlefields) },
  ];

  const mainSwaps = sections[0].diff.removed.reduce((s, c) => s + c.n, 0);

  const rankedDecks = globalDecks
    .map((d, i) => ({ i, label: d.label, avgDist: avgDistances[i] }))
    .sort((a, b) => a.avgDist - b.avgDist);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-6 items-end pb-6 border-b border-surface-border">
        <img className="w-24 h-24 rounded-2xl object-cover shadow-sm" src="/cache/images/Diana_Lunari.webp" alt="Diana" />
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight m-0 text-content-heading">Compare</h1>
          <p className="text-content max-w-2xl m-0 leading-relaxed">
            Git-style comparison of any two lists: <span className="text-status-danger font-medium">red cards</span> leave deck A, <span className="text-status-lock font-medium">green cards</span> come in for deck B.
          </p>
        </div>
      </div>

      <div className="glass-panel p-4 flex flex-wrap items-center justify-center gap-4 sticky top-[100px] z-10">
        <select 
          className="input-field !w-auto flex-1 min-w-[200px] bg-surface font-medium text-content-heading shadow-sm" 
          value={diffA} 
          onChange={e => setDiffA(Number(e.target.value))}
        >
          {globalDecks.map((d, i) => (
            <option key={i} value={i}>{d.label}</option>
          ))}
        </select>
        
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-muted border border-surface-border text-xs font-bold text-content-muted shrink-0">
          vs
        </div>
        
        <select 
          className="input-field !w-auto flex-1 min-w-[200px] bg-surface font-medium text-content-heading shadow-sm" 
          value={diffB} 
          onChange={e => setDiffB(Number(e.target.value))}
        >
          {globalDecks.map((d, i) => (
            <option key={i} value={i}>{d.label}</option>
          ))}
        </select>
      </div>

      {diffA === diffB ? (
        <div className="p-8 text-center border-2 border-dashed border-surface-border rounded-xl text-content-muted bg-surface-hover/50 max-w-2xl mx-auto">
          Same deck selected on both sides — pick two different lists.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="bg-brand-accent-bg border border-brand-accent/20 rounded-xl p-5 text-content flex items-center gap-4">
            <div className="text-4xl font-bold tracking-tight text-brand-accent px-4 border-r border-brand-accent/20">
              {mainSwaps}
            </div>
            <div className="leading-relaxed">
              Main-deck swap{mainSwaps === 1 ? '' : 's'} to turn <br className="sm:hidden" />
              <strong className="text-content-heading">{deckA.label}</strong> into <strong className="text-content-heading">{deckB.label}</strong>.
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections.map(({ title, diff }) => {
              if (!diff.removed.length && !diff.added.length) return null;
              return (
                <div key={title} className="glass-panel overflow-hidden">
                  <div className="bg-surface-muted border-b border-surface-border px-4 py-2 font-bold text-sm tracking-wide text-content-heading uppercase">
                    {title}
                  </div>
                  <div className="flex flex-col">
                    {diff.removed.map(c => (
                      <div key={`rem-${c.name}`} className="flex items-center gap-3 px-4 py-2.5 bg-status-danger/5 border-l-2 border-status-danger text-status-danger hover:bg-status-danger/10 transition-colors">
                        {imageMap[c.name] ? (
                          <img src={imageMap[c.name]} alt={c.name} className="w-8 h-8 object-cover rounded border border-status-danger/20 shadow-sm" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-status-danger/10 border border-status-danger/20 flex items-center justify-center text-[10px]">?</div>
                        )}
                        <span className="font-mono font-bold text-lg leading-none w-6 text-right">&minus;{c.n}</span>
                        <span className="font-medium">{c.name}</span>
                      </div>
                    ))}
                    {diff.added.map(c => (
                      <div key={`add-${c.name}`} className="flex items-center gap-3 px-4 py-2.5 bg-status-lock/5 border-l-2 border-status-lock text-status-lock hover:bg-status-lock/10 transition-colors">
                        {imageMap[c.name] ? (
                          <img src={imageMap[c.name]} alt={c.name} className="w-8 h-8 object-cover rounded border border-status-lock/20 shadow-sm" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-status-lock/10 border border-status-lock/20 flex items-center justify-center text-[10px]">?</div>
                        )}
                        <span className="font-mono font-bold text-lg leading-none w-6 text-right">+{c.n}</span>
                        <span className="font-medium">{c.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 mt-8 pt-8 border-t border-surface-border">
        <div>
          <h2 className="text-2xl font-bold m-0 text-content-heading mb-2">Swap-distance analysis</h2>
          <p className="text-sm text-content-muted max-w-4xl">
            "Swap distance" is the number of cards you need to change to turn one deck into another. Lower average means closer to the consensus. Hover a matrix cell for the pair.
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
          <div className="glass-panel p-5 text-sm">
            <h3 className="font-bold text-content-heading mb-3 pb-2 border-b border-surface-border">Most representative decks</h3>
            <div className="flex flex-col gap-2">
              {rankedDecks.slice(0, 10).map(d => (
                <div key={d.i} className="flex justify-between items-center group">
                  <span 
                    className="font-medium text-brand-accent hover:underline cursor-pointer truncate mr-2"
                    onClick={() => { setDiffA(0); setDiffB(d.i); }}
                    title={`Click to compare ${d.label} with current selected deck A`}
                  >
                    {d.label}
                  </span>
                  <span className="text-content-muted font-mono whitespace-nowrap bg-surface-muted px-1.5 py-0.5 rounded text-xs border border-surface-border group-hover:border-brand-accent/30 transition-colors">
                    avg {d.avgDist.toFixed(1)}
                  </span>
                </div>
              ))}
              {rankedDecks.length > 10 && (
                <div className="text-center pt-2 mt-2 border-t border-surface-border text-content-muted text-xs">
                  + {rankedDecks.length - 10} more
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel overflow-x-auto p-4 custom-scrollbar">
            <table className="w-full text-center text-xs font-mono whitespace-nowrap">
              <thead>
                <tr>
                  <td className="text-left font-bold text-content-heading uppercase tracking-wider text-[10px] pb-2 px-2 sticky left-0 bg-surface z-10 border-r border-surface-border">Deck</td>
                  {globalDecks.map((d, i) => (
                    <td key={i} title={d.label} className="pb-2 px-1 text-content-muted font-bold min-w-[24px]">#{i + 1}</td>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {globalDecks.map((d, i) => (
                  <tr key={i} className="hover:bg-surface-hover">
                    <td className="text-left py-1.5 px-2 sticky left-0 bg-surface group-hover:bg-surface-hover z-10 border-r border-surface-border">
                      <span className="text-content-muted mr-1.5 inline-block w-4 text-right">#{i + 1}</span> 
                      <span 
                        className="font-medium text-brand-accent hover:underline cursor-pointer truncate max-w-[150px] inline-block align-bottom" 
                        title={d.label}
                        onClick={() => { setDiffA(i); setDiffB(diffB); }}
                      >
                        {d.label}
                      </span>
                    </td>
                    {globalDecks.map((_, j) => {
                      if (i === j) {
                        return <td key={j} className="py-1.5 px-1 text-surface-border">-</td>;
                      }
                      const dVal = distances[i]?.[j] ?? 0;
                      let colorClass = 'text-content';
                      let bgClass = '';
                      
                      if (dVal <= 3) {
                        colorClass = 'text-status-lock font-bold';
                        bgClass = 'bg-status-lock/10';
                      } else if (dVal >= 10) {
                        colorClass = 'text-status-danger';
                        bgClass = 'bg-status-danger/5';
                      }

                      return (
                        <td 
                          key={j} 
                          title={`${globalDecks[i].label} vs ${globalDecks[j].label}: ${dVal} swaps`}
                          className={`py-1.5 px-1 ${colorClass} ${bgClass} cursor-crosshair hover:ring-1 hover:ring-inset hover:ring-brand-accent transition-all`}
                          onClick={() => { setDiffA(i); setDiffB(j); }}
                        >
                          {dVal}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Compare;
