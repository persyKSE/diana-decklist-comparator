import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { wilson } from '../utils/math';
import { threatWeights } from '../utils/metaMath';

export interface Match {
  id: string;
  date: string;
  arch: string;
  result: 'W' | 'L';
  play: 'play' | 'draw' | null;
  mull: number | null;
  deck: string | null;
  notes: string | null;
}

const Log: React.FC = () => {
  const { field, meta } = useAppContext();
  const [matches, setMatches] = useState<Match[]>([]);
  const [arch, setArch] = useState('');
  const [play, setPlay] = useState<'play' | 'draw' | ''>('');
  const [mull, setMull] = useState<number | ''>('');
  const [deck] = useState(''); // Just keeping deck state for compatibility if we want it later
  const [notes, setNotes] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ddl-matches');
      if (stored) setMatches(JSON.parse(stored));
    } catch (e) {}
  }, []);

  const saveMatches = (newMatches: Match[]) => {
    setMatches(newMatches);
    try { localStorage.setItem('ddl-matches', JSON.stringify(newMatches)); } catch (e) {}
  };

  const logMatch = (result: 'W' | 'L') => {
    if (!arch) {
      alert("Pick the opponent's archetype first");
      return;
    }
    const newMatch: Match = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      date: new Date().toISOString().slice(0, 10),
      arch, result,
      play: play || null,
      mull: mull === '' ? null : Number(mull),
      deck: deck || null,
      notes: notes.trim() || null,
    };
    saveMatches([...matches, newMatch]);
    setArch(''); setPlay(''); setMull(''); setNotes('');
  };

  const removeMatch = (id: string) => {
    if (window.confirm('Delete this match?')) {
      saveMatches(matches.filter(m => m.id !== id));
    }
  };

  const threatRank = useMemo(() => {
    const r: Record<string, { rank: number, weight: number }> = {};
    if (field && meta) {
      threatWeights(field, meta, { recency: false, region: null }, { includeMirror: true })
        .rows.forEach((row, i) => r[row.slug] = { rank: i + 1, weight: row.weight });
    }
    return r;
  }, [field, meta]);

  const archName = (slug: string) => (field?.archetypes?.[slug] ? field.archetypes[slug].name : slug);

  // Group by matchup
  const rows = useMemo(() => {
    const bySlug: Record<string, Match[]> = {};
    matches.forEach(x => {
      bySlug[x.arch] = bySlug[x.arch] || [];
      bySlug[x.arch].push(x);
    });
    
    return Object.entries(bySlug).map(([slug, games]) => {
      const gw = games.filter(x => x.result === 'W').length;
      const onPlay = games.filter(x => x.play === 'play');
      const onDraw = games.filter(x => x.play === 'draw');
      return {
        slug, n: games.length, w: gw, wr: gw / games.length,
        ci: wilson(gw, games.length),
        playStr: onPlay.length ? `${onPlay.filter(x => x.result === 'W').length}–${onPlay.filter(x => x.result === 'L').length}` : '—',
        drawStr: onDraw.length ? `${onDraw.filter(x => x.result === 'W').length}–${onDraw.filter(x => x.result === 'L').length}` : '—',
        threat: threatRank[slug] || null,
      };
    }).sort((a, b) => (a.threat && b.threat) ? a.threat.rank - b.threat.rank : b.n - a.n);
  }, [matches, threatRank]);

  const wTotal = matches.filter(x => x.result === 'W').length;
  const [loAll, hiAll] = wilson(wTotal, Math.max(1, matches.length));
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const recent = matches.filter(x => x.date >= weekAgo);

  const archOpts = field ? threatWeights(field, meta, { recency: false, region: null }, { includeMirror: true }).rows : [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-6 items-end pb-6 border-b border-surface-border">
        <img className="w-24 h-24 rounded-2xl object-cover shadow-sm" src="/cache/images/Diana_Lunari.webp" alt="Diana" />
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight m-0 text-content-heading">Log</h1>
          <p className="text-content max-w-2xl m-0 leading-relaxed">
            No tournament series publishes match data, so the community has no global matchup stats. You have to build your own. Log your games here to see what you actually need to practice and tech for.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold m-0 text-content-heading">Log a game</h2>
        <div className="glass-panel p-4 flex flex-wrap gap-3 items-center">
          <select 
            className="input-field !w-auto" 
            value={arch} 
            onChange={e => setArch(e.target.value)}
          >
            <option value="">opponent…</option>
            {archOpts.map(r => (
              <option key={r.slug} value={r.slug}>{r.mirror ? 'Diana (mirror)' : field?.archetypes?.[r.slug]?.name || r.slug}</option>
            ))}
          </select>
          
          <select 
            className="input-field !w-auto" 
            value={play} 
            onChange={e => setPlay(e.target.value as any)}
          >
            <option value="">play/draw?</option>
            <option value="play">on the play</option>
            <option value="draw">on the draw</option>
          </select>
          
          <select 
            className="input-field !w-auto" 
            value={mull} 
            onChange={e => setMull(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">mulligan?</option>
            <option value={0}>kept 4</option>
            <option value={1}>set aside 1</option>
            <option value={2}>set aside 2</option>
          </select>
          
          <input 
            className="input-field flex-1 min-w-[200px]" 
            placeholder="notes (what decided it?)" 
            value={notes} 
            onChange={e => setNotes(e.target.value)} 
          />
          
          <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <button 
              className="flex-1 sm:flex-none px-6 py-2 bg-status-lock hover:bg-status-lock/90 text-white font-bold rounded-lg shadow-sm transition-all active:scale-95" 
              onClick={() => logMatch('W')}
            >
              Won
            </button>
            <button 
              className="flex-1 sm:flex-none px-6 py-2 bg-status-danger hover:bg-status-danger/90 text-white font-bold rounded-lg shadow-sm transition-all active:scale-95" 
              onClick={() => logMatch('L')}
            >
              Lost
            </button>
          </div>
        </div>
      </div>

      {!matches.length ? (
        <div className="p-8 text-center border border-surface-border rounded-xl text-content-muted bg-surface-muted/50 leading-relaxed max-w-3xl mx-auto mt-8">
          No games logged yet. Every other number on this site is inferred from decklists because <strong className="text-content-heading">no event publishes match results</strong> — this page is where you fix that for yourself. Log practice and tournament games with one tap; at ~10 games per matchup the intervals start meaning something.
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="bg-brand-accent-bg border border-brand-accent/20 rounded-xl p-5 text-content flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold tracking-tight text-brand-accent">
                {wTotal}<span className="text-brand-accent/40 mx-1">–</span>{matches.length - wTotal}
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-content-heading">Overall Record</span>
                <span className="text-sm">
                  {Math.round(100 * wTotal / matches.length)}% win rate <span className="text-content-muted">(95% CI {loAll.toFixed(0)}–{hiAll.toFixed(0)}%)</span>
                </span>
              </div>
            </div>
            <div className="text-sm font-mono text-content-muted flex flex-col items-end">
              <span>{matches.length} total games</span>
              <span>{recent.length} this week</span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-bold m-0 text-content-heading mb-2">By matchup</h2>
              <p className="text-sm text-content-muted max-w-4xl">
                Ordered by the archetype's threat rank in the expected field, so the top rows are the matchups that matter most. "Drill this" = losing record against a top-8 threat with 4+ games — the highest-value practice you can schedule.
              </p>
            </div>
            
            <div className="glass-panel overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-surface-muted border-b border-surface-border text-content-muted uppercase tracking-wider text-xs font-semibold">
                  <tr>
                    <th className="py-3 px-4">Opponent</th>
                    <th className="py-3 px-4 text-center">Threat #</th>
                    <th className="py-3 px-4 text-center">Games</th>
                    <th className="py-3 px-4">Record</th>
                    <th className="py-3 px-4 text-center">On play</th>
                    <th className="py-3 px-4 text-center">On draw</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {rows.map(r => {
                    const drill = r.threat && r.threat.rank <= 8 && r.n >= 4 && r.wr < 0.5;
                    const strong = r.n >= 4 && r.ci[0] > 50;
                    return (
                      <tr key={r.slug} className={`hover:bg-surface-hover transition-colors ${drill ? 'bg-status-danger/5' : ''}`}>
                        <td className="py-3 px-4 font-bold text-content-heading">{archName(r.slug)}</td>
                        <td className="py-3 px-4 text-center font-mono text-content-muted">{r.threat ? `#${r.threat.rank}` : '—'}</td>
                        <td className="py-3 px-4 text-center font-mono">{r.n}</td>
                        <td className="py-3 px-4 w-48">
                          <div className="flex flex-col gap-1 w-full max-w-[120px]">
                            <div className="flex justify-between text-xs font-mono">
                              <span className="font-bold text-content-heading">{r.w}–{r.n - r.w}</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-surface-border relative overflow-hidden">
                              <div 
                                className={`absolute top-0 bottom-0 left-0 ${r.wr >= 0.5 ? 'bg-status-lock' : 'bg-status-danger'}`} 
                                style={{ width: `${Math.round(100 * r.wr)}%` }}
                              ></div>
                            </div>
                            <div className="text-[10px] text-content-muted font-mono flex justify-between">
                              <span>{r.ci[0].toFixed(0)}%</span>
                              <span>{r.ci[1].toFixed(0)}%</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono">{r.playStr}</td>
                        <td className="py-3 px-4 text-center font-mono">{r.drawStr}</td>
                        <td className="py-3 px-4 text-right">
                          {drill && <span className="badge-neutral border-status-danger/30 text-status-danger bg-status-danger/10 text-xs py-1">drill this</span>}
                          {strong && <span className="badge-neutral border-status-lock/30 text-status-lock bg-status-lock/10 text-xs py-1">solid</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-content-muted">
              Intervals are Wilson 95% — at 5 games a 3–2 honestly means "somewhere between 23% and 88%", so log more before believing a number.
            </p>
          </div>

          <div className="flex flex-col gap-4 mt-4">
            <h2 className="text-2xl font-bold m-0 text-content-heading">Match History</h2>
            
            <div className="glass-panel overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-surface-muted border-b border-surface-border text-content-muted uppercase tracking-wider text-xs font-semibold">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Opponent</th>
                    <th className="py-3 px-4 text-center">Result</th>
                    <th className="py-3 px-4 text-center">Play/Draw</th>
                    <th className="py-3 px-4 text-center">Mulligan</th>
                    <th className="py-3 px-4 w-full">Notes</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {[...matches].reverse().map(m => (
                    <tr key={m.id} className="hover:bg-surface-hover transition-colors group">
                      <td className="py-2.5 px-4 text-content-muted font-mono text-xs">{m.date}</td>
                      <td className="py-2.5 px-4 font-medium text-content-heading">{archName(m.arch)}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md font-bold text-xs ${m.result === 'W' ? 'bg-status-lock/20 text-status-lock' : 'bg-status-danger/20 text-status-danger'}`}>
                          {m.result}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center text-content-muted capitalize text-xs">{m.play || '—'}</td>
                      <td className="py-2.5 px-4 text-center text-content-muted text-xs">{m.mull != null ? `Set aside ${m.mull}` : '—'}</td>
                      <td className="py-2.5 px-4 text-content-muted text-sm truncate max-w-[200px] sm:max-w-xs">{m.notes || '—'}</td>
                      <td className="py-2.5 px-4 text-right">
                        <button 
                          className="w-7 h-7 rounded-md flex items-center justify-center text-content-muted hover:text-status-danger hover:bg-status-danger/10 opacity-0 group-hover:opacity-100 transition-all" 
                          onClick={() => removeMatch(m.id)}
                          title="Delete match"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Log;
