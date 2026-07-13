/* Community deck submissions, backed by D1 (binding: DB).
 *
 * GET  /api/submissions  → JSON array of deck objects in decks.json shape
 * POST /api/submissions  → validate + store one deck, returns { success, deck }
 *
 * The client only sends names and counts. Every stored row is rebuilt here
 * from the deployed card catalogue (field.json served as a static asset), so
 * client-supplied costs/images/labels never reach the database — that closes
 * off both stored XSS and stat poisoning via fabricated card data. Inserts
 * are atomic (no KV read-modify-write races) and deduped by a content hash.
 */

const MAX_BODY_BYTES = 32 * 1024;
const MAX_PER_IP_PER_HOUR = 5;
const MAX_PER_DAY = 200;
const MAX_RETURNED = 500;
// A submission stops appearing in GET once this many distinct IPs report it.
// Shared (duplicated, not imported — see report.js) with the report endpoint.
const REPORT_HIDE_THRESHOLD = 3;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function ensureSchema(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS submissions (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         ip_hash TEXT NOT NULL,
         deck_hash TEXT NOT NULL UNIQUE,
         deck TEXT NOT NULL,
         report_count INTEGER NOT NULL DEFAULT 0
       )`
    )
    .run();
  // The column above is new; a table created before this shipped won't have
  // it. D1/SQLite has no "ADD COLUMN IF NOT EXISTS", so add it and swallow
  // the one error that means "already there" — same idempotent-per-request
  // spirit as CREATE TABLE IF NOT EXISTS above.
  try {
    await db.prepare('ALTER TABLE submissions ADD COLUMN report_count INTEGER NOT NULL DEFAULT 0').run();
  } catch (e) {
    if (!/duplicate column/i.test(String((e && e.message) || e))) throw e;
  }
}

// The card catalogue ships with every deploy; cache it per isolate.
let catalogueCache = null;
async function catalogue(context) {
  if (catalogueCache) return catalogueCache;
  const url = new URL('/field.json', context.request.url);
  const res = await context.env.ASSETS.fetch(new Request(url));
  if (!res.ok) throw new Error('card catalogue unavailable');
  catalogueCache = (await res.json()).cards || {};
  return catalogueCache;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Validate one {name, count} section against the catalogue. Returns either
// {error} or {rows} rebuilt entirely from catalogue data, sorted by name so
// the same deck always hashes the same.
function buildSection(entries, cards, { types, maxCopies, maxEntries, label }) {
  if (!Array.isArray(entries) || entries.length > maxEntries)
    return { error: `${label}: expected at most ${maxEntries} entries` };
  const seen = new Set();
  const rows = [];
  let total = 0;
  for (const e of entries) {
    if (!e || typeof e.name !== 'string' || !Number.isInteger(e.count))
      return { error: `${label}: each entry needs a name and an integer count` };
    if (e.count < 1 || e.count > maxCopies)
      return { error: `${label}: "${e.name.slice(0, 60)}" count must be 1–${maxCopies}` };
    if (seen.has(e.name)) return { error: `${label}: "${e.name.slice(0, 60)}" listed twice` };
    seen.add(e.name);
    const info = cards[e.name];
    if (!info || !types.includes(info.type))
      return { error: `${label}: "${e.name.slice(0, 60)}" is not a known ${types.join('/')} card` };
    total += e.count;
    rows.push({
      name: e.name,
      count: e.count,
      image: info.image || null,
      cost: info.cost != null ? info.cost : null,
      type: info.type,
      color: info.color || [],
      might: info.might != null ? info.might : null,
    });
  }
  rows.sort((a, b) => (a.name < b.name ? -1 : 1));
  return { rows, total };
}

export async function onRequestGet(context) {
  try {
    await ensureSchema(context.env.DB);
    // report_count crossing the threshold hides a row from everyone — the
    // one moderation lever this app has, since there is no login system to
    // build a real admin role on top of. Hard delete is still a manual
    // `wrangler d1 execute --remote`, unchanged.
    const { results } = await context.env.DB
      .prepare('SELECT id, deck FROM submissions WHERE report_count < ? ORDER BY id LIMIT ?')
      .bind(REPORT_HIDE_THRESHOLD, MAX_RETURNED)
      .all();
    // id is merged in (not stored inside the JSON blob) so the client can
    // target a specific row when reporting it.
    return json(results.map((r) => ({ id: r.id, ...JSON.parse(r.deck) })));
  } catch (e) {
    return json({ error: 'submissions unavailable' }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'deck too large' }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      return json({ error: 'invalid JSON' }, 400);
    }

    const cards = await catalogue(context);
    const main = buildSection(body.cards, cards, {
      types: ['Unit', 'Spell', 'Gear'], maxCopies: 3, maxEntries: 40, label: 'main deck',
    });
    if (main.error) return json({ error: main.error }, 400);
    if (main.total !== 40) return json({ error: `main deck must total exactly 40 cards (got ${main.total})` }, 400);

    const side = buildSection(body.sideboard || [], cards, {
      types: ['Unit', 'Spell', 'Gear'], maxCopies: 3, maxEntries: 8, label: 'sideboard',
    });
    if (side.error) return json({ error: side.error }, 400);
    if (side.total > 8) return json({ error: `sideboard must total at most 8 cards (got ${side.total})` }, 400);

    const runes = buildSection(body.runes || [], cards, {
      types: ['Rune'], maxCopies: 12, maxEntries: 6, label: 'runes',
    });
    if (runes.error) return json({ error: runes.error }, 400);
    if (runes.total !== 12) return json({ error: `runes must total exactly 12 (got ${runes.total})` }, 400);

    const bfs = buildSection(body.battlefields || [], cards, {
      types: ['Battlefield'], maxCopies: 1, maxEntries: 3, label: 'battlefields',
    });
    if (bfs.error) return json({ error: bfs.error }, 400);

    // Canonical deck object — every field below is server-authored.
    const today = new Date().toISOString().slice(0, 10);
    const deck = {
      label: 'Community deck — ' + today,
      player: 'Anonymous',
      placement: 'Community',
      event: 'Community submission',
      event_date: today,
      attendance: null,
      weight: 1.0,
      url: null,
      source: 'user',
      cards: main.rows,
      sideboard: side.rows,
      runes: runes.rows,
      battlefields: bfs.rows,
    };

    // Content hash over the list itself (not the date) → same 52 cards
    // resubmitted next week is still a duplicate.
    const deckHash = await sha256Hex(
      JSON.stringify({ c: main.rows, s: side.rows, r: runes.rows, b: bfs.rows })
    );
    const ipHash = await sha256Hex(request.headers.get('CF-Connecting-IP') || 'unknown');

    await ensureSchema(env.DB);
    const [{ results: ipRows }, { results: dayRows }] = await env.DB.batch([
      env.DB.prepare(
        "SELECT COUNT(*) AS n FROM submissions WHERE ip_hash = ? AND created_at > datetime('now','-1 hour')"
      ).bind(ipHash),
      env.DB.prepare(
        "SELECT COUNT(*) AS n FROM submissions WHERE created_at > datetime('now','-1 day')"
      ),
    ]);
    if (ipRows[0].n >= MAX_PER_IP_PER_HOUR)
      return json({ error: 'rate limit: try again in an hour' }, 429);
    if (dayRows[0].n >= MAX_PER_DAY)
      return json({ error: 'the community pool is busy today — try again tomorrow' }, 429);

    const res = await env.DB
      .prepare(
        'INSERT INTO submissions (ip_hash, deck_hash, deck) VALUES (?, ?, ?) ON CONFLICT(deck_hash) DO NOTHING'
      )
      .bind(ipHash, deckHash, JSON.stringify(deck))
      .run();
    if (!res.meta.changes) return json({ success: true, duplicate: true });
    return json({ success: true, deck });
  } catch (e) {
    return json({ error: 'submission failed' }, 500);
  }
}
