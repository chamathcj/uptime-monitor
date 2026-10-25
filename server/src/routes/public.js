import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

const DAYS = 30;
const CACHE_TTL_MS = 30 * 1000;
const MAX_CACHE_ENTRIES = 500;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

const cache = new Map();

function lastDays(n) {
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)
    );
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function monitorState(m) {
  if (m.status === 'down') return 'down';
  if (m.consecutive_failures > 0) return 'degraded';
  if (m.status === 'pending') return 'pending';
  return 'up';
}

async function buildPage(slug) {
  const page = await pool.query(
    'SELECT user_id, title, description FROM status_pages WHERE slug = $1',
    [slug]
  );
  if (page.rowCount === 0) return null;
  const { user_id: userId, title, description } = page.rows[0];

  
  const monitors = await pool.query(
    `SELECT id, name, status, consecutive_failures
     FROM monitors
     WHERE user_id = $1 AND show_on_status_page AND NOT is_paused
     ORDER BY name`,
    [userId]
  );

  const daily = await pool.query(
    `SELECT c.monitor_id,
            to_char((c.checked_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE c.ok)::int AS ok_count
     FROM checks c
     JOIN monitors m ON m.id = c.monitor_id
     WHERE m.user_id = $1 AND m.show_on_status_page AND NOT m.is_paused
       AND c.checked_at > now() - interval '31 days'
     GROUP BY c.monitor_id, 2`,
    [userId]
  );

  
  const incidents = await pool.query(
    `SELECT m.name AS monitor, i.started_at, i.resolved_at,
            EXTRACT(EPOCH FROM (COALESCE(i.resolved_at, now()) - i.started_at))::int
              AS duration_seconds
     FROM incidents i
     JOIN monitors m ON m.id = i.monitor_id
     WHERE m.user_id = $1 AND m.show_on_status_page AND NOT m.is_paused
       AND (i.resolved_at IS NULL OR i.resolved_at > now() - interval '30 days')
     ORDER BY i.started_at DESC
     LIMIT 50`,
    [userId]
  );

  const days = lastDays(DAYS);
  const dailyByMonitor = new Map();
  for (const row of daily.rows) {
    if (!dailyByMonitor.has(row.monitor_id)) {
      dailyByMonitor.set(row.monitor_id, new Map());
    }
    dailyByMonitor.get(row.monitor_id).set(row.day, row);
  }

  const list = monitors.rows.map((m) => {
    const byDay = dailyByMonitor.get(m.id) ?? new Map();
    let total = 0;
    let ok = 0;
    const bars = days.map((date) => {
      const row = byDay.get(date);
      if (!row) return { date, uptime: null };
      total += row.total;
      ok += row.ok_count;
      return { date, uptime: Math.round((1000 * row.ok_count) / row.total) / 10 };
    });
    return {
      name: m.name,
      status: monitorState(m),
      uptime_30d: total > 0 ? Math.round((10000 * ok) / total) / 100 : null,
      days: bars,
    };
  });

  const downCount = list.filter((m) => m.status === 'down').length;
  let overall = 'operational';
  if (list.length === 0) overall = 'empty';
  else if (downCount === list.length) overall = 'major_outage';
  else if (downCount > 0) overall = 'partial_outage';
  else if (list.some((m) => m.status === 'degraded')) overall = 'degraded';

  return {
    title,
    description,
    overall,
    updated_at: new Date().toISOString(),
    monitors: list,
    incidents: incidents.rows,
  };
}


router.get('/status/:slug', async (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  if (!SLUG_RE.test(slug)) return res.status(404).json({ error: 'Not found' });

  res.set('Cache-Control', 'public, max-age=30');

  const hit = cache.get(slug);
  if (hit && hit.expires > Date.now()) return res.json(hit.data);

  const data = await buildPage(slug);
  if (!data) return res.status(404).json({ error: 'Not found' });

  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(slug, { data, expires: Date.now() + CACHE_TTL_MS });
  res.json(data);
});

export default router;