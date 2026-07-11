// Subsequence match, so "khaz" and "kzmh" both find Kha'Zix, Mutating Horror.
export function fuzzyScore(hay: string, needle: string): number {
  if (!needle) return 0;
  const h = hay.toLowerCase(), q = needle.toLowerCase();
  const direct = h.indexOf(q);
  if (direct === 0) return 1000;
  if (direct > 0) return 500 - direct;
  let hi = 0, score = 0;
  for (const ch of q) {
    const found = h.indexOf(ch, hi);
    if (found === -1) return -1;
    score += (found === hi ? 3 : 1);
    hi = found + 1;
  }
  return score;
}
