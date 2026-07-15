import React from 'react';

interface ManaCurveProps {
  deck: Record<string, number>;
  cardMeta: Record<string, any>;
}

const MAX_BUCKET = 7;

const ManaCurve: React.FC<ManaCurveProps> = ({ deck, cardMeta }) => {
  const buckets = Array(MAX_BUCKET + 1).fill(0);
  Object.entries(deck).forEach(([name, count]) => {
    const cost = cardMeta[name]?.cost;
    const bucket = cost == null ? 0 : Math.min(cost, MAX_BUCKET);
    buckets[bucket] += count;
  });
  const max = Math.max(1, ...buckets);
  const total = buckets.reduce((a, b) => a + b, 0);

  if (total === 0) return null;

  return (
    <div className="flex items-end gap-1.5 h-20">
      {buckets.map((n, cost) => (
        <div key={cost} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
          <span className="text-[10px] font-mono text-content-muted">{n > 0 ? n : ''}</span>
          <div
            className="w-full rounded-t bg-brand-accent/70"
            style={{ height: `${(n / max) * 100}%`, minHeight: n > 0 ? '3px' : '0' }}
          />
          <span className="text-[10px] font-mono text-content-muted">{cost === MAX_BUCKET ? `${cost}+` : cost}</span>
        </div>
      ))}
    </div>
  );
};

export default ManaCurve;
