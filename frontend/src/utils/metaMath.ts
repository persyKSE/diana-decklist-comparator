export interface FieldModel {
  recency: boolean;
  region: string | null;
}

const FIELD_HALF_LIFE_DAYS = 30; // example from original

export function fieldLatestDate(events: any[]): number {
  if (!events || !events.length) return Date.now();
  const dates = events.map(e => new Date(e.date).getTime()).filter(t => !isNaN(t));
  return dates.length ? Math.max(...dates) : Date.now();
}

export function regionOf(eventName: string): string {
  if (!eventName) return 'Other';
  const name = eventName.toLowerCase();
  if (name.includes('na ') || name.includes('north america')) return 'NA';
  if (name.includes('eu ') || name.includes('europe')) return 'EU';
  if (name.includes('apac') || name.includes('asia')) return 'APAC';
  return 'Other';
}

export function fieldDeckWeight(d: any, fieldModel: FieldModel, latestDate: number) {
  if (fieldModel.region && regionOf(d.event) !== fieldModel.region) return 0;
  if (!fieldModel.recency) return 1;
  const age = d.date ? Math.max(0, (latestDate - new Date(d.date).getTime()) / 86400000) : 120;
  return Math.pow(0.5, age / FIELD_HALF_LIFE_DAYS);
}

export function archConversion(slug: string, field: any, meta: any) {
  const P = meta && meta.performance;
  const a = field.archetypes[slug];
  if (!P || !P.fieldConversion || !a || !a.legend) return null;
  const row = P.archetypes.find((x: any) => x.slug === a.legend);
  if (!row) return null;
  return { ...row, index: row.conversion / P.fieldConversion, fieldConversion: P.fieldConversion };
}

export function threatWeights(field: any, meta: any, fieldModel: FieldModel, opts?: { includeMirror?: boolean }) {
  if (!field || !field.archetypes) return { rows: [], rawN: 0, effN: 0, modelOn: false };
  const includeMirror = opts && opts.includeMirror;
  const slugs = Object.keys(field.archetypes);
  const wOf: Record<string, number> = {};
  let totalW = 0, rawN = 0, effN = 0;
  
  const latestDate = fieldLatestDate(meta?.events || []);

  slugs.forEach(slug => {
    const w = field.archetypes[slug].decks.reduce((a: number, d: any) => a + fieldDeckWeight(d, fieldModel, latestDate), 0);
    wOf[slug] = w; 
    totalW += w;
    rawN += field.archetypes[slug].decks.length; 
    effN += w;
  });

  const rows = slugs
    .filter(s => includeMirror || s !== field.diana)
    .map(slug => {
      const conv = archConversion(slug, field, meta);
      const share = totalW ? wOf[slug] / totalW : 0;
      return {
        slug, 
        n: field.archetypes[slug].decks.length, 
        effN: wOf[slug], 
        share, 
        conv,
        weight: share * (conv ? conv.index : 1), 
        mirror: slug === field.diana,
      };
    })
    .filter(r => r.effN > 0)
    .sort((a, b) => b.weight - a.weight);
    
  return { rows, rawN, effN, modelOn: !!(fieldModel.recency || fieldModel.region) };
}

export function archTrend(_slug: string, _field: any, _meta: any): any {
  // simplified stub for the trend visual
  return null;
}
