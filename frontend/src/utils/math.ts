export const PLACEMENT_RANK: Record<string, number> = { '1st': 0, '2nd': 1, '3rd': 2, 'Top 4': 3, 'Top 8': 4, 'Top 16': 5 };

// Wilson score 95% interval for k successes in n trials → [lo, hi] as percents.
export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
  return [Math.max(0, (centre - margin) / denom) * 100, Math.min(1, (centre + margin) / denom) * 100];
}

const _lnFactCache: number[] = [0, 0];
export function lnFact(n: number): number {
  for (let i = _lnFactCache.length; i <= n; i++) _lnFactCache[i] = _lnFactCache[i - 1] + Math.log(i);
  return _lnFactCache[n];
}

export function lnC(n: number, k: number): number { 
  return (k < 0 || k > n) ? -Infinity : lnFact(n) - lnFact(k) - lnFact(n - k); 
}

// P(at least `k` of the `K` copies among `draws` cards off a `deck`-card deck).
export function hyperAtLeast(k: number, K: number, deck: number, draws: number): number {
  if (k <= 0) return 1;
  if (K < k || draws < k || deck <= 0) return 0;
  let p = 0;
  for (let i = k; i <= Math.min(K, draws); i++) {
    p += Math.exp(lnC(K, i) + lnC(deck - K, draws - i) - lnC(deck, draws));
  }
  return Math.max(0, Math.min(1, p));
}

// Cards seen off the main deck by the start of your turn T: the opening 4 plus
// one per draw step. The mulligan replaces cards rather than adding them, so it
// doesn't change this count — only the odds below.
export function cardsSeenByTurn(t: number, deck: number, handSize: number): number { 
  return Math.min(deck, handSize + t); 
}

// A Riftbound mulligan sets aside up to 2 and draws replacements without
// reshuffling, so a miss on the opening 4 gets two more looks at a 36-card
// deck that still holds every copy. That makes it strictly better than the
// plain opening-hand number, and it's exactly computable.
export function openingWithMulligan(K: number, deck: number, handSize: number, mulliganMax: number): number {
  const hit = hyperAtLeast(1, K, deck, handSize);
  return hit + (1 - hit) * hyperAtLeast(1, K, deck - handSize, mulliganMax);
}

// Never round a near-certainty up to a flat 100% (or a real chance down to 0%).
export function pct(p: number): string {
  const v = 100 * p;
  if (v >= 99.5 && p < 1) return '>99%';
  if (v > 0 && v < 0.5) return '<1%';
  return v.toFixed(0) + '%';
}
