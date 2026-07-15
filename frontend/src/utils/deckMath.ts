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

const SECTION_RE = /^(MainDeck|Legend|Champion|Runes|Battlefields|Sideboard):/i;

// Parses a full decklist paste — either a plain one-card-per-line list (main
// deck only, same as parseDeckText) or a list with section headers like
// "Sideboard:" / "Runes:" / "Battlefields:", one section's worth of lines
// following each header until the next one.
export function parseFullDecklist(text: string, nameLookup: Record<string, string>, nonMainNames: Set<string>) {
  const main: Record<string, number> = {};
  const side: Record<string, number> = {};
  const runes: Record<string, number> = {};
  const battlefields: string[] = [];
  const unknownMain: string[] = [];

  if (!SECTION_RE.test(text)) {
    const { counts, unknown } = parseDeckText(text, nameLookup, nonMainNames);
    return { main: counts, side, runes, battlefields, unknownMain: unknown };
  }

  let section: 'maindeck' | 'sideboard' | 'runes' | 'battlefields' = 'maindeck';
  text.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;
    const header = trimmed.match(SECTION_RE);
    if (header) {
      const h = header[1].toLowerCase();
      section = h === 'sideboard' ? 'sideboard' : h === 'runes' ? 'runes' : h === 'battlefields' ? 'battlefields' : 'maindeck';
      return;
    }

    let count = 1, name = trimmed;
    let m = trimmed.match(/^(\d{1,2})\s*[xX]?\s+(.+)$/);
    if (m) { count = parseInt(m[1], 10); name = m[2]; }
    else {
      m = trimmed.match(/^(.+?)\s*[xX]\s*(\d{1,2})$/);
      if (m) { name = m[1]; count = parseInt(m[2], 10); }
    }
    name = name.trim();
    const canon = nameLookup[normName(name)] || name;

    if (section === 'maindeck') {
      if (!nameLookup[normName(name)]) unknownMain.push(name);
      main[canon] = (main[canon] || 0) + count;
    } else if (section === 'sideboard') {
      side[canon] = (side[canon] || 0) + count;
    } else if (section === 'runes') {
      if (count > 0) runes[canon] = count;
    } else if (section === 'battlefields') {
      battlefields.push(canon);
    }
  });

  return { main, side, runes, battlefields: battlefields.slice(0, 3), unknownMain };
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

const DECK_SIZE = 40;
const MAX_COST_BUCKET = 8;

function costBucket(name: string, cardMeta: Record<string, any>): number {
  const m = cardMeta[name];
  return m && m.cost != null ? Math.min(m.cost, MAX_COST_BUCKET) : 2;
}

function targetCurveOf(decks: Deck[], cardMeta: Record<string, any>): number[] {
  const target = Array(MAX_COST_BUCKET + 1).fill(0);
  const totalW = decks.reduce((a, d) => a + effWeight(d), 0) || 1;
  decks.forEach(d => d.cards.forEach(c => { target[costBucket(c.name, cardMeta)] += effWeight(d) * c.count / totalW; }));
  return target;
}

export interface ProtoCard {
  name: string;
  copies: number;
  locked: boolean;
  score: number;
  decksIn: number;
}

// Curve-aware greedy fill: cards every deck in the slice runs go in first at
// their consensus copy count, then remaining cards are added by score with a
// penalty for overfilling a cost bucket beyond the slice's average curve
// (+1 tolerance). Mirrors the legacy builder's computeProto exactly.
export function computeProto(decks: Deck[], ranked: any[], cardMeta: Record<string, any>): ProtoCard[] {
  const proto: ProtoCard[] = [];
  const N = decks.length;
  if (!N) return proto;
  const target = targetCurveOf(decks, cardMeta);
  const curveNow = Array(MAX_COST_BUCKET + 1).fill(0);
  let total = 0;
  const copiesOf = (c: any) => Math.max(1, Math.round(c.copies));
  const push = (c: any, copies: number, locked: boolean) => {
    proto.push({ name: c.name, score: c.score, decksIn: c.decksIn, copies, locked });
    total += copies;
    curveNow[costBucket(c.name, cardMeta)] += copies;
  };
  ranked.filter(c => c.decksIn === N).forEach(c => {
    if (total >= DECK_SIZE) return;
    const copies = Math.min(copiesOf(c), 3, DECK_SIZE - total);
    if (copies > 0) push(c, copies, true);
  });
  const remaining = ranked.filter(c => c.decksIn < N);
  while (total < DECK_SIZE && remaining.length) {
    let bestIdx = -1, bestAdj = -Infinity;
    remaining.forEach((c, idx) => {
      const copies = Math.min(copiesOf(c), 3, DECK_SIZE - total);
      if (copies <= 0) return;
      const b = costBucket(c.name, cardMeta);
      const overfill = Math.max(0, curveNow[b] + copies - (target[b] + 1));
      const adj = c.score - 6 * overfill;
      if (adj > bestAdj) { bestAdj = adj; bestIdx = idx; }
    });
    if (bestIdx < 0) break;
    const c = remaining.splice(bestIdx, 1)[0];
    push(c, Math.min(copiesOf(c), 3, DECK_SIZE - total), false);
  }
  return proto.sort((a, b) => b.score - a.score);
}

// Consensus runes / battlefields / sideboard over a slice of decks — the
// parts of a registrable deck the 40-card prototype alone omits.
export function consensusExtras(decks: Deck[]) {
  const totalW = decks.reduce((a, d) => a + effWeight(d), 0) || 1;
  const runeAvg: Record<string, number> = {};
  decks.forEach(d => (d.runes || []).forEach(r => { runeAvg[r.name] = (runeAvg[r.name] || 0) + effWeight(d) * r.count / totalW; }));
  const runes = Object.entries(runeAvg).map(([name, avg]) => ({ name, avg, count: Math.round(avg) }))
    .sort((a, b) => b.avg - a.avg);
  let sum = runes.reduce((a, r) => a + r.count, 0);
  while (sum > 12) { const r = [...runes].sort((a, b) => (b.count - b.avg) - (a.count - a.avg))[0]; if (!r || r.count <= 0) break; r.count--; sum--; }
  while (sum < 12 && runes.length) { const r = [...runes].sort((a, b) => (a.count - a.avg) - (b.count - b.avg))[0]; r.count++; sum++; }

  const bfFreq: Record<string, number> = {};
  decks.forEach(d => (d.battlefields || []).forEach(b => { bfFreq[b.name] = (bfFreq[b.name] || 0) + 1; }));
  const bfs = Object.entries(bfFreq).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);

  const sideStats: Record<string, any> = {};
  decks.forEach(d => (d.sideboard || []).forEach(c => {
    if (!sideStats[c.name]) sideStats[c.name] = { score: 0, decksIn: 0, counts: [], weights: [] };
    const s = sideStats[c.name];
    s.score += effWeight(d) * c.count; s.decksIn += 1;
    s.counts.push(c.count); s.weights.push(effWeight(d));
  }));
  const side: { name: string; copies: number }[] = [];
  let total = 0;
  Object.entries(sideStats)
    .map(([name, s]: [string, any]) => ({ name, score: s.score, copies: Math.max(1, Math.round(weightedAverage(s.counts, s.weights))) }))
    .sort((a, b) => b.score - a.score)
    .forEach(c => {
      if (total >= 8) return;
      const copies = Math.min(c.copies, 8 - total);
      if (copies > 0) { side.push({ name: c.name, copies }); total += copies; }
    });

  return { runes, bfs, side };
}

// Serializes a builder deck (main + runes + battlefields + sideboard) to the
// same plain-text decklist format the search/import parser round-trips.
export function serializeDeck(
  mainDeck: Record<string, number>,
  runes: Record<string, number>,
  battlefields: string[],
  sideDeck: Record<string, number>,
  cardMeta: Record<string, any>
) {
  const sortEntries = (d: Record<string, number>) => Object.entries(d).sort((a, b) => {
    const ca = cardMeta[a[0]]?.cost ?? 99;
    const cb = cardMeta[b[0]]?.cost ?? 99;
    return ca - cb || a[0].localeCompare(b[0]);
  });

  let text = sortEntries(mainDeck).map(([name, n]) => `${n}x ${name}`).join('\n');

  const runeEntries = Object.entries(runes).filter(([, n]) => n > 0);
  if (runeEntries.length) text += '\n\nRunes:\n' + runeEntries.map(([name, n]) => `${n}x ${name}`).join('\n');

  if (battlefields.length) text += '\n\nBattlefields:\n' + battlefields.map(name => `1x ${name}`).join('\n');

  const sideEntries = sortEntries(sideDeck);
  if (sideEntries.length) text += '\n\nSideboard:\n' + sideEntries.map(([name, n]) => `${n}x ${name}`).join('\n');

  return text;
}
