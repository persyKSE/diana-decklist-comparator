import React from 'react';
import { useAppContext } from '../context/AppContext';

interface CardModalProps {
  cardName: string;
  onClose: () => void;
}

const CardModal: React.FC<CardModalProps> = ({ cardName, onClose }) => {
  const { imageMap, cards, field } = useAppContext();
  
  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const cardData = cards?.[cardName] || field?.cards?.[cardName];
  if (!cardData) return null;

  return (
    <div 
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div className="bg-surface border border-surface-border w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-surface-border bg-surface-muted/50">
          <h2 className="text-xl font-bold text-content-heading m-0">{cardName}</h2>
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
        <div className="flex-1 overflow-y-auto p-6 bg-surface flex flex-col items-center">
          {imageMap[cardName] ? (
            <img src={imageMap[cardName]} alt={cardName} className="w-full max-w-[300px] rounded-xl shadow-lg border border-surface-border" />
          ) : (
            <div className="w-full max-w-[300px] aspect-[3/4] rounded-xl shadow-lg border border-surface-border bg-surface-hover flex items-center justify-center text-content-muted">
              Image not found
            </div>
          )}

          <div className="mt-6 w-full flex flex-col gap-3 text-sm">
            {cardData.type && (
              <div className="flex justify-between items-center pb-2 border-b border-surface-border">
                <span className="text-content-muted font-medium">Type</span>
                <span className="font-bold text-content-heading">{cardData.type}</span>
              </div>
            )}
            {cardData.cost !== undefined && cardData.cost !== null && (
              <div className="flex justify-between items-center pb-2 border-b border-surface-border">
                <span className="text-content-muted font-medium">Cost</span>
                <span className="font-bold text-content-heading">{cardData.cost}</span>
              </div>
            )}
            {cardData.color && cardData.color.length > 0 && (
              <div className="flex justify-between items-center pb-2 border-b border-surface-border">
                <span className="text-content-muted font-medium">Color</span>
                <span className="font-bold text-content-heading">{cardData.color.join(', ')}</span>
              </div>
            )}
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
    </div>
  );
};

export default CardModal;
