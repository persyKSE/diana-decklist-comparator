import React, { useState } from 'react';

interface ImportDeckModalProps {
  onImport: (text: string) => void;
  onClose: () => void;
}

const ImportDeckModal: React.FC<ImportDeckModalProps> = ({ onImport, onClose }) => {
  const [text, setText] = useState('');

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
      onClick={handleBackdropClick}
    >
      <div className="bg-surface border border-surface-border w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-start justify-between p-4 border-b border-surface-border bg-surface-muted/50">
          <div>
            <h2 className="text-xl font-bold text-content-heading m-0">Import a decklist</h2>
            <p className="text-sm text-content-muted mt-1 mb-0">
              Paste a full list with headers like <code>MainDeck:</code>, <code>Runes:</code>, <code>Battlefields:</code>, <code>Sideboard:</code> — or just paste main deck cards, one per line.
            </p>
          </div>
          <button
            className="w-8 h-8 shrink-0 rounded-full bg-surface hover:bg-surface-hover border border-surface-border flex items-center justify-center text-content-muted hover:text-content-heading transition-colors"
            onClick={onClose}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <div className="p-4">
          <textarea
            autoFocus
            className="w-full min-h-[220px] font-mono text-sm p-3 rounded-lg border border-surface-border bg-surface-muted text-content focus:outline-none focus:ring-2 focus:ring-brand-accent"
            placeholder={'3 Gust\n3 Stacked Deck\n...\n\nRunes:\n7 Chaos Rune\n5 Mind Rune\n\nSideboard:\n2 Turn to Dust'}
            value={text}
            onChange={e => setText(e.target.value)}
          />
        </div>

        <div className="p-4 border-t border-surface-border bg-surface-muted/30 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onImport(text)}>Import</button>
        </div>
      </div>
    </div>
  );
};

export default ImportDeckModal;
