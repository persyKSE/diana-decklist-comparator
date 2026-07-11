import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import DeckModal from '../components/DeckModal';

const Decks: React.FC = () => {
  const { globalDecks } = useAppContext();
  const [selectedDeckIndex, setSelectedDeckIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-6 items-end pb-6 border-b border-surface-border">
        <img className="w-24 h-24 rounded-2xl object-cover shadow-sm" src="/cache/images/Diana_Lunari.webp" alt="Diana" />
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight m-0 text-content-heading">Source Decks</h1>
          <p className="text-content max-w-2xl m-0 leading-relaxed">
            Every tournament list in the filtered set. Click a deck to open its full decklist.
          </p>
        </div>
      </div>

      <div className="decks-grid" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {globalDecks.map((d, i) => {
          const cardTotal = d.cards?.reduce((a, c) => a + c.count, 0) || 0;
          return (
            <div 
              key={i} 
              className="glass-panel flex items-center justify-between p-4 hover:bg-surface-hover hover:border-brand-accent/30 transition-all cursor-pointer group" 
              onClick={() => setSelectedDeckIndex(i)}
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  {d.placement && (
                    <span className="badge-neutral bg-surface-muted text-content-heading font-bold px-2 py-0.5 border-surface-border">
                      {d.placement}
                    </span>
                  )}
                  <span className="font-bold text-lg text-content-heading group-hover:text-brand-accent transition-colors">
                    {d.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-content-muted font-mono flex-wrap">
                  {[
                    d.event,
                    d._region,
                    d.event_date,
                    d._clusterName,
                    <span key="count" className="font-medium text-content">{cardTotal} cards</span>
                  ].filter(Boolean).map((item, idx, arr) => (
                    <React.Fragment key={idx}>
                      {item}
                      {idx < arr.length - 1 && <span className="text-surface-border">•</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div className="text-content-muted group-hover:text-brand-accent group-hover:translate-x-1 transition-all px-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </div>
            </div>
          );
        })}
        
        {globalDecks.length === 0 && (
          <div className="p-8 text-center border-2 border-dashed border-surface-border rounded-xl text-content-muted bg-surface-hover/50">
            No decks found matching the current filters.
          </div>
        )}
      </div>

      {selectedDeckIndex !== null && (
        <DeckModal deckIndex={selectedDeckIndex} onClose={() => setSelectedDeckIndex(null)} />
      )}
    </div>
  );
};

export default Decks;
