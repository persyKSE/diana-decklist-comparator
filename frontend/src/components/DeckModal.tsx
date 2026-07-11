import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import CardModal from './CardModal';

interface DeckModalProps {
  deckIndex: number;
  onClose: () => void;
}

const DeckModal: React.FC<DeckModalProps> = ({ deckIndex, onClose }) => {
  const { globalDecks, imageMap } = useAppContext();
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const deck = globalDecks[deckIndex];

  if (!deck) return null;

  const cardTotal = deck.cards?.reduce((a, c) => a + c.count, 0) || 0;
  
  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div className="bg-surface border border-surface-border w-full max-w-4xl max-h-full rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-surface-border bg-surface-muted/50">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              {deck.placement && (
                <span className="badge-neutral bg-surface text-content-heading font-bold px-2 py-0.5 border-surface-border shadow-sm">
                  {deck.placement}
                </span>
              )}
              <h2 className="text-2xl font-bold text-content-heading m-0">{deck.label}</h2>
            </div>
            <div className="flex items-center gap-2 text-sm text-content-muted font-mono flex-wrap">
              {[
                deck.event,
                deck._region,
                deck.event_date,
                deck._clusterName,
                <span key="count" className="font-medium text-content">{cardTotal} cards</span>
              ].filter(Boolean).map((item, idx, arr) => (
                <React.Fragment key={idx}>
                  {item}
                  {idx < arr.length - 1 && <span className="text-surface-border">•</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
          <button 
            className="w-8 h-8 rounded-full bg-surface hover:bg-surface-hover border border-surface-border flex items-center justify-center text-content-muted hover:text-content-heading transition-colors"
            onClick={onClose}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-surface">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            
            {/* Main Deck */}
            <div className="flex flex-col gap-3 lg:col-span-2">
              <h3 className="font-bold text-lg text-content-heading border-b border-surface-border pb-2">Main Deck</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {deck.cards?.map(c => (
                  <div 
                    key={c.name} 
                    className="relative aspect-[3/4] w-full rounded-md shadow-sm overflow-hidden border border-surface-border group cursor-pointer hover:border-brand-accent/50 transition-colors"
                    onClick={() => setSelectedCard(c.name)}
                  >
                    {imageMap[c.name] ? (
                      <img src={imageMap[c.name]} alt={c.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-surface-hover flex items-center justify-center text-xs text-center p-2 text-content-muted">
                        {c.name}
                      </div>
                    )}
                    <span className="absolute bottom-1 w-full text-center pointer-events-none">
                      <span className="inline-block px-3 py-0.5 bg-black/80 backdrop-blur-md text-white text-sm font-bold rounded-full shadow-lg border border-white/10 tracking-widest">
                        ×{c.count}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sideboard & Runes */}
            <div className="flex flex-col gap-8">
              {deck.sideboard && deck.sideboard.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="font-bold text-lg text-content-heading border-b border-surface-border pb-2">Sideboard</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {deck.sideboard.map(c => (
                      <div 
                        key={c.name} 
                        className="relative aspect-[3/4] w-full rounded-md shadow-sm overflow-hidden border border-surface-border cursor-pointer hover:border-brand-accent/50 transition-colors group"
                        onClick={() => setSelectedCard(c.name)}
                      >
                        {imageMap[c.name] ? (
                          <img src={imageMap[c.name]} alt={c.name} className="w-full h-full object-cover opacity-80" />
                        ) : (
                          <div className="w-full h-full bg-surface-hover flex items-center justify-center text-xs text-center p-2 text-content-muted">
                            {c.name}
                          </div>
                        )}
                        <span className="absolute bottom-1 w-full text-center pointer-events-none">
                          <span className="inline-block px-2 py-0.5 bg-black/80 text-white text-xs font-bold rounded-full shadow-lg border border-white/10 tracking-widest">
                            ×{c.count}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {deck.runes && deck.runes.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="font-bold text-lg text-content-heading border-b border-surface-border pb-2">Runes</h3>
                  <div className="flex flex-col gap-2">
                    {deck.runes.map(r => (
                      <div key={r.name} className="flex items-center justify-between p-3 rounded-lg border border-surface-border bg-surface-hover text-sm">
                        <span className="font-medium text-content">{r.name}</span>
                        <span className="px-2 py-0.5 bg-surface-muted border border-surface-border rounded text-xs font-mono">{r.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-border bg-surface-muted/30 text-right">
          <button 
            className="btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
      
      {selectedCard && (
        <CardModal cardName={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  );
};

export default DeckModal;
