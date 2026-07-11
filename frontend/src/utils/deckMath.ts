import type { Deck, CardCount } from '../context/AppContext';

export function normName(s: string): string {
  return s.replace(/’/g, "'").toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function parseDeckText(text: string, nameLookup: Record<string, string>, nonMainNames: Set<string>) {
  const counts: Record<string, number> = {};
  const unknown: string[] = [];
  const nonMain: string[] = [];

  text.split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) return;
    let count = 1, name = line;
    let m = line.match(/^(\d{1,2})\s*[xX]?\s+(.+)$/);
    if (m) { count = parseInt(m[1], 10); name = m[2]; }
    else {
      m = line.match(/^(.+?)\s*[xX]\s*(\d{1,2})$/);
      if (m) { name = m[1]; count = parseInt(m[2], 10); }
    }
    name = name.trim();
    const canon = nameLookup[normName(name)];
    if (canon && nonMainNames.has(canon)) { nonMain.push(canon); return; }
    if (canon) name = canon; else unknown.push(name);
    counts[name] = (counts[name] || 0) + count;
  });
  return { counts, unknown, nonMain };
}

export function diffSection(listA: CardCount[] | undefined, listB: CardCount[] | undefined) {
  const a: Record<string, number> = {};
  const b: Record<string, number> = {};
  (listA || []).forEach(c => a[c.name] = c.count);
  (listB || []).forEach(c => b[c.name] = c.count);
  const removed: { name: string; n: number }[] = [];
  const added: { name: string; n: number }[] = [];
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach(name => {
    const delta = (b[name] || 0) - (a[name] || 0);
    if (delta < 0) removed.push({ name, n: -delta });
    else if (delta > 0) added.push({ name, n: delta });
  });
  const sortFn = (x: {name: string, n: number}, y: {name: string, n: number}) => y.n - x.n || x.name.localeCompare(y.name);
  return { removed: removed.sort(sortFn), added: added.sort(sortFn) };
}

export function deckDistance(listA: CardCount[] | undefined, listB: CardCount[] | undefined) {
  const a: Record<string, number> = {};
  const b: Record<string, number> = {};
  (listA || []).forEach(c => a[c.name] = c.count);
  (listB || []).forEach(c => b[c.name] = c.count);
  let d = 0;
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach(n => d += Math.abs((a[n] || 0) - (b[n] || 0)));
  return d / 2;
}

export function distanceMatrix(decks: Deck[]) {
  const N = decks.length;
  const m = Array(N).fill(0).map(() => Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const d = deckDistance(decks[i].cards, decks[j].cards);
      m[i][j] = d; m[j][i] = d;
    }
  }
  return m;
}

export function buildIndices(decks: Deck[], field: any) {
  const imageMap: Record<string, string> = {};
  const cardMeta: Record<string, any> = {};
  const nameLookup: Record<string, string> = {};
  const nonMainNames = new Set<string>();

  decks.forEach(d => {
    d.cards.concat(d.sideboard || []).forEach(c => {
      if ((c as any).image && !imageMap[c.name]) imageMap[c.name] = (c as any).image;
      if (!cardMeta[c.name]) cardMeta[c.name] = { cost: (c as any).cost, type: (c as any).type, color: (c as any).color || [], might: (c as any).might };
      nameLookup[normName(c.name)] = c.name;
    });
    (d.runes || []).concat(d.battlefields || []).forEach(c => {
      if ((c as any).image && !imageMap[c.name]) imageMap[c.name] = (c as any).image;
      nameLookup[normName(c.name)] = c.name;
      nonMainNames.add(c.name);
    });
  });

  if (field && field.cards) {
    Object.entries(field.cards).forEach(([name, c]: [string, any]) => {
      if (c.image && !imageMap[name]) imageMap[name] = c.image;
      if (!cardMeta[name]) cardMeta[name] = { cost: c.cost, type: c.type, color: c.color || [], might: c.might };
    });
  }

  return { imageMap, cardMeta, nameLookup, nonMainNames };
}

function effWeight(d: Deck) { return d.weight || 1; }
function weightedAverage(values: number[], weights: number[]) {
  const sV = values.reduce((a, v, i) => a + v * weights[i], 0);
  const sW = weights.reduce((a, w) => a + w, 0);
  return sW ? sV / sW : 0;
}

export function computeStats(decks: Deck[]) {
  const stats: Record<string, any> = {};
  decks.forEach(d => {
    const w = effWeight(d);
    d.cards.forEach(c => {
      if (!stats[c.name]) stats[c.name] = { decksIn: 0, weightedScore: 0, counts: [], weights: [], dist: {} };
      const s = stats[c.name];
      s.decksIn += 1; s.weightedScore += w * c.count;
      s.counts.push(c.count); s.weights.push(w);
      s.dist[c.count] = (s.dist[c.count] || 0) + 1;
    });
  });

  return Object.entries(stats).map(([name, s]) => ({
    name, score: s.weightedScore, decksIn: s.decksIn,
    copies: weightedAverage(s.counts, s.weights),
    avgCopies: s.counts.reduce((a: number, b: number) => a + b, 0) / s.counts.length,
    dist: s.dist
  })).sort((a, b) => b.score - a.score || b.decksIn - a.decksIn);
}
