import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';

// Local UI state for the search filters
interface SearchState {
  name: string;
  text: string;
  type: string;
  color: string;
  emin: string;
  emax: string;
  mmin: string;
  mmax: string;
  sort: string;
  page: number;
}

const BUILDER_PAGE = 30;

const Build: React.FC = () => {
  const { 
    mainDeck, setMainDeck, 
    sideDeck, setSideDeck, 
    builderRunes, 
    cards, field, imageMap, cardMeta
  } = useAppContext();

  const [preview, setPreview] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState>({
    name: '', text: '', type: '', color: '', emin: '', emax: '', mmin: '', mmax: '', sort: 'cost', page: 0
  });

  const mainTotal = Object.values(mainDeck).reduce((a, b) => a + b, 0);
  const sideTotal = Object.values(sideDeck).reduce((a, b) => a + b, 0);
  const valid = mainTotal === 40 && sideTotal <= 8;
  const runeTotal = Object.values(builderRunes).reduce((a, b) => a + b, 0);

  // Deck Manipulation
  const modDeck = (setDeck: any, name: string, delta: number) => {
    setDeck((prev: Record<string, number>) => {
      const next = { ...prev };
      const cur = next[name] || 0;
      const val = Math.max(0, cur + delta);
      if (val === 0) delete next[name];
      else next[name] = val;
      return next;
    });
  };

  const handleTileClick = (name: string, sec: 'main' | 'side', e: React.MouseEvent) => {
    e.preventDefault();
    if (e.shiftKey) {
      // Move between main and side
      modDeck(sec === 'main' ? setMainDeck : setSideDeck, name, -1);
      modDeck(sec === 'main' ? setSideDeck : setMainDeck, name, 1);
    } else if (e.type === 'contextmenu') {
      modDeck(sec === 'main' ? setMainDeck : setSideDeck, name, -1);
    } else {
      modDeck(sec === 'main' ? setMainDeck : setSideDeck, name, 1);
    }
  };

  const handleSearchClick = (name: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (e.type === 'contextmenu') {
      modDeck(setSideDeck, name, 1);
    } else {
      modDeck(setMainDeck, name, 1);
    }
  };

  // Search logic
  const searchResults = useMemo(() => {
    if (!cards || !field) return [];
    const allCardsMap = { ...cards, ...field.cards };
    const allCards = Object.entries(allCardsMap).map(([name, data]: [string, any]) => ({ name, ...data }));
    
    return allCards.filter((c: any) => {
      if (search.name && !c.name.toLowerCase().includes(search.name.toLowerCase())) return false;
      if (search.text && !(c.effect || '').toLowerCase().includes(search.text.toLowerCase())) return false;
      if (search.type && c.type !== search.type) return false;
      if (search.color) {
        if (search.color === 'Colorless') {
          if (c.color && c.color.length > 0) return false;
        } else {
          if (!c.color || !c.color.includes(search.color)) return false;
        }
      }
      if (search.emin !== '' && (c.cost == null || c.cost < parseInt(search.emin))) return false;
      if (search.emax !== '' && (c.cost == null || c.cost > parseInt(search.emax))) return false;
      if (search.mmin !== '' && (c.might == null || c.might < parseInt(search.mmin))) return false;
      if (search.mmax !== '' && (c.might == null || c.might > parseInt(search.mmax))) return false;
      return true;
    }).sort((a: any, b: any) => {
      if (search.sort === 'cost') return (a.cost ?? 99) - (b.cost ?? 99) || a.name.localeCompare(b.name);
      if (search.sort === 'might') return (b.might ?? -1) - (a.might ?? -1) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [search, cards, field]);

  const pagedResults = searchResults.slice(search.page * BUILDER_PAGE, (search.page + 1) * BUILDER_PAGE);
  const totalPages = Math.max(1, Math.ceil(searchResults.length / BUILDER_PAGE));

  const sortedEntries = (deck: Record<string, number>) => {
    return Object.entries(deck).sort((a, b) => {
      const ca = cardMeta[a[0]]?.cost ?? 99;
      const cb = cardMeta[b[0]]?.cost ?? 99;
      return ca - cb || a[0].localeCompare(b[0]);
    });
  };

  const renderTile = (name: string, count: number, sec: 'main' | 'side' | 'search') => {
    const img = imageMap[name];
    const cost = cardMeta[name]?.cost;
    const maxed = count >= 3;
    
    return (
      <div 
        key={name}
        className={`relative aspect-[3/4] w-full rounded-md shadow-sm overflow-hidden border transition-all cursor-pointer group ${maxed ? 'opacity-50 grayscale select-none' : 'hover:-translate-y-0.5 hover:shadow-md border-surface-border hover:border-brand-accent/50'}`}
        onMouseEnter={() => setPreview(name)}
        onClick={(e) => sec === 'search' ? handleSearchClick(name, e) : handleTileClick(name, sec, e)}
        onContextMenu={(e) => sec === 'search' ? handleSearchClick(name, e) : handleTileClick(name, sec, e)}
        title={`${name} — ${sec === 'search' ? 'Click to add to main, right-click to add to side' : 'Click +1, right-click -1, shift-click to move'}`}
      >
        {img ? (
          <img src={img} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-surface-hover flex items-center justify-center text-xs text-center p-2 text-content-muted">
            {name}
          </div>
        )}
        
        {cost != null && (
          <span className="absolute top-1 left-1 w-6 h-6 rounded-full bg-surface/90 backdrop-blur-sm shadow flex items-center justify-center text-xs font-bold text-content-heading border border-surface-border">
            {cost}
          </span>
        )}
        
        {count > 0 && (
          <span className="absolute bottom-1 w-full text-center pointer-events-none">
            <span className="inline-block px-3 py-0.5 bg-black/80 backdrop-blur-md text-white text-sm font-bold rounded-full shadow-lg border border-white/10 tracking-widest">
              ×{count}
            </span>
          </span>
        )}
      </div>
    );
  };

  const previewCard = preview && (cards?.[preview] || field?.cards?.[preview]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-6 items-end pb-6 border-b border-surface-border">
        <img className="w-24 h-24 rounded-2xl object-cover shadow-sm" src="/cache/images/Diana_Lunari.webp" alt="Diana" />
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight m-0 text-content-heading">Build</h1>
          <p className="text-content max-w-2xl m-0 leading-relaxed">
            Build your deck with the evidence beside you: this lab watches every winning Diana list and turns it into a consensus build, live draw odds, rune math and coaching.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-6" id="deckBuilder">
        {/* LEFT — preview + deck management */}
        <div className="flex flex-col gap-4">
          <div className="glass-panel p-4 flex flex-col gap-4 sticky top-[100px]" id="bPreview">
            {!previewCard ? (
              <div className="aspect-[3/4] w-full rounded-xl bg-surface-muted border border-surface-border border-dashed flex items-center justify-center text-content-muted text-sm text-center px-4">
                Hover a card to see it here
              </div>
            ) : (
              <>
                <div className="aspect-[3/4] w-full rounded-xl overflow-hidden bg-surface-muted shadow-inner relative">
                  {imageMap[preview] ? (
                    <img className="w-full h-full object-cover" src={imageMap[preview]} alt={preview} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-content-muted text-sm">{preview}</div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="font-bold text-lg text-content-heading leading-tight">{preview}</div>
                  <div className="flex items-center gap-2 text-xs font-mono text-content-muted">
                    {previewCard.cost != null && (
                      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-surface-muted border border-surface-border text-content-heading font-bold shadow-sm">
                        {previewCard.cost}
                      </span>
                    )}
                    <span>{[previewCard.type, previewCard.rarity].filter(Boolean).join(' · ')}</span>
                  </div>
                </div>
                {previewCard.effect && (
                  <div className="text-sm leading-relaxed text-content bg-surface-muted/50 p-3 rounded-lg border border-surface-border whitespace-pre-wrap">
                    {previewCard.effect}
                  </div>
                )}
              </>
            )}
            
            <div className="flex flex-col gap-2 pt-4 border-t border-surface-border mt-auto">
              <button className="btn-primary w-full" onClick={() => {/* load consensus logic */}}>
                Load Consensus Build
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-secondary w-full text-sm">Copy deck</button>
                <button className="btn-secondary w-full text-sm !text-status-danger !border-status-danger/20 hover:!bg-status-danger/10" onClick={() => { setMainDeck({}); setSideDeck({}); }}>
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER — the deck itself */}
        <div className="flex flex-col gap-6">
          <div className="glass-panel p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-surface-border">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold m-0 text-content-heading">Main Deck</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-sm font-mono font-medium border ${valid ? 'bg-status-lock/10 text-status-lock border-status-lock/20' : 'bg-status-danger/10 text-status-danger border-status-danger/20'}`}>
                  {valid ? '✓ Valid' : `${mainTotal}/40`}
                </span>
              </div>
              <select 
                className="input-field !w-auto !py-1 text-sm bg-surface-muted border-transparent"
                value={search.sort} 
                onChange={e => setSearch({...search, sort: e.target.value})}
              >
                <option value="cost">Sort: energy</option>
                <option value="name">Sort: name</option>
                <option value="might">Sort: might</option>
              </select>
            </div>

            {mainTotal > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3">
                {sortedEntries(mainDeck).map(([name, count]) => renderTile(name, count, 'main'))}
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-surface-border rounded-xl text-content-muted bg-surface-hover/50">
                Your main deck is empty. Use the card search to add cards.
              </div>
            )}
            
            <div className="mt-8 flex gap-6 overflow-x-auto pb-4 custom-scrollbar">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-content-heading">Runes</h3>
                  <span className="text-xs font-mono text-content-muted">{runeTotal}/12</span>
                </div>
                <div className="flex gap-2">
                  {Object.entries(builderRunes).map(([rune, count]) => (
                    <div key={rune} className="flex-1 relative aspect-square rounded-lg border border-surface-border bg-surface-hover flex flex-col items-center justify-center p-2 text-center text-xs text-content-muted">
                      <span>{rune}</span>
                      <span className="absolute bottom-2 right-2 px-1.5 bg-black/80 text-white font-mono text-[10px] rounded shadow">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-surface-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-content-heading">Side Deck</h3>
                <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${sideTotal <= 8 ? 'bg-surface-muted text-content-muted border-surface-border' : 'bg-status-danger/10 text-status-danger border-status-danger/20'}`}>
                  {sideTotal}/8
                </span>
              </div>
              {sideTotal > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3">
                  {sortedEntries(sideDeck).map(([name, count]) => renderTile(name, count, 'side'))}
                </div>
              ) : (
                <div className="p-6 text-sm text-center border border-dashed border-surface-border rounded-xl text-content-muted bg-surface-hover/50">
                  No sideboard cards. Right-click a search result to add one.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — search */}
        <div className="flex flex-col gap-4">
          <div className="glass-panel p-4 flex flex-col gap-4 sticky top-[100px]">
            <div>
              <label className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-1.5">Card name</label>
              <input 
                type="text" 
                className="input-field"
                placeholder="Search by name…" 
                value={search.name} 
                onChange={e => setSearch({...search, name: e.target.value, page: 0})} 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-1.5">Type</label>
              <select 
                className="input-field"
                value={search.type} 
                onChange={e => setSearch({...search, type: e.target.value, page: 0})}
              >
                {['', 'Unit', 'Spell', 'Gear'].map(t => <option key={t} value={t}>{t || 'All types'}</option>)}
              </select>
            </div>
            
            <button 
              className="btn-secondary w-full mt-2" 
              onClick={() => setSearch({ name: '', text: '', type: '', color: '', emin: '', emax: '', mmin: '', mmax: '', sort: 'cost', page: 0 })}
            >
              Reset Filters
            </button>
            
            <div className="flex items-center justify-between mt-2 pt-4 border-t border-surface-border text-xs text-content-muted">
              <span>{searchResults.length} results</span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button 
                    className="p-1 rounded bg-surface hover:bg-surface-hover border border-surface-border disabled:opacity-50" 
                    disabled={search.page === 0} 
                    onClick={() => setSearch({...search, page: search.page - 1})}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                  </button>
                  <span className="font-mono">{search.page + 1}/{totalPages}</span>
                  <button 
                    className="p-1 rounded bg-surface hover:bg-surface-hover border border-surface-border disabled:opacity-50" 
                    disabled={search.page >= totalPages - 1} 
                    onClick={() => setSearch({...search, page: search.page + 1})}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 overflow-y-auto max-h-[calc(100vh-420px)] custom-scrollbar pr-2" id="bResults">
              {pagedResults.length > 0 ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                  {pagedResults.map((c: any) => renderTile(c.name, 0, 'search'))}
                </div>
              ) : (
                <div className="p-4 text-center text-sm text-content-muted bg-surface-muted rounded-lg border border-surface-border">
                  No matching cards found.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Build;
