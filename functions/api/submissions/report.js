/* Community deck reports, backed by the same D1 binding (DB) as
 * /api/submissions. POST { id } → flags one deck; once a deck accumulates
 * REPORT_HIDE_THRESHOLD distinct-IP reports it stops appearing in
 * GET /api/submissions.
 *
 * This app has no login system anywhere, so there is no way to build a real
 * moderator role — this is community flagging, not admin moderation. What
 * it gives: the public can collectively suppress a bad submission without
 * needing direct D1 access, which was previously the only lever
 * (`wrangler d1 execute diana-submissions --remote`). Hard delete still
 * requires that; this only ever hides.
 *
 * Small helpers below are duplicated from submissions.js rather than
 * imported from a shared module — deliberately, to keep this file
 * self-contained and avoid introducing a new cross-file build dependency
 * on a live production Function for a feature this size.
 */

const REPORT_HIDE_THRESHOLD = 3;
const MAX_REPORTS_PER_IP_PER_HOUR = 20;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

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
  try {
    await db.prepare('ALTER TABLE submissions ADD COLUMN report_count INTEGER NOT NULL DEFAULT 0').run();
  } catch (e) {
    if (!/duplicate column/i.test(String((e && e.message) || e))) throw e;
  }
  // One row per (deck, IP) — the composite primary key is what makes a
  // repeat report from the same visitor a no-op instead of inflating the
  // count, so hiding a deck takes distinct reporters, not one person
  // clicking repeatedly.
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS reports (
         deck_id INTEGER NOT NULL,
         ip_hash TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         PRIMARY KEY (deck_id, ip_hash)
       )`
    )
    .run();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const raw = await request.text();
    if (raw.length > 256) return json({ error: 'bad request' }, 400);
    let body;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      return json({ error: 'invalid JSON' }, 400);
    }
    const id = Number.isInteger(body.id) ? body.id : null;
    if (!id) return json({ error: 'missing deck id' }, 400);

    await ensureSchema(env.DB);
    const ipHash = await sha256Hex(request.headers.get('CF-Connecting-IP') || 'unknown');

    // Rate-limit reporting itself, or reporting becomes a free-form spam
    // vector against the very protection the submission rate limit provides.
    const { results: rateRows } = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM reports WHERE ip_hash = ? AND created_at > datetime('now','-1 hour')")
      .bind(ipHash)
      .all();
    if (rateRows[0].n >= MAX_REPORTS_PER_IP_PER_HOUR) return json({ error: 'rate limit: try again later' }, 429);

    const ins = await env.DB
      .prepare('INSERT INTO reports (deck_id, ip_hash) VALUES (?, ?) ON CONFLICT(deck_id, ip_hash) DO NOTHING')
      .bind(id, ipHash)
      .run();
    if (!ins.meta.changes) return json({ success: true, alreadyReported: true });

    await env.DB.prepare('UPDATE submissions SET report_count = report_count + 1 WHERE id = ?').bind(id).run();
    const { results } = await env.DB.prepare('SELECT report_count FROM submissions WHERE id = ?').bind(id).all();
    const count = results[0] ? results[0].report_count : null;
    return json({ success: true, reportCount: count, hidden: count != null && count >= REPORT_HIDE_THRESHOLD });
  } catch (e) {
    return json({ error: 'report failed' }, 500);
  }
}
