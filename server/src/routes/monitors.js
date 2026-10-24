import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { checkUrl } from '../utils/urlSafety.js';

const router = Router();
router.use(requireAuth);

const MAX_MONITORS_PER_USER = 10;

const monitorSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  url: z.string().trim().max(2000).superRefine((value, ctx) => {
    const problem = checkUrl(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  }),
  interval_seconds: z.coerce.number().int().min(60).max(3600).default(300),
  timeout_ms: z.coerce.number().int().min(1000).max(30000).default(10000),
  expected_status: z.coerce.number().int().min(100).max(599).default(200),
  is_paused: z.boolean().default(false),
});

const FIELDS = `id, name, url, interval_seconds, timeout_ms, expected_status,
                is_paused, status, created_at`;

 
router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).json({ error: 'Not found' });
  next();
});

async function ownsMonitor(id, userId) {
  const r = await pool.query(
    'SELECT 1 FROM monitors WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return r.rowCount > 0;
}

 
router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT m.id, m.name, m.url, m.interval_seconds, m.timeout_ms,
            m.expected_status, m.is_paused, m.status, m.created_at,
            s.checks_24h, s.uptime_24h, s.avg_response_24h,
            lc.checked_at AS last_checked_at,
            lc.response_time_ms AS last_response_time_ms
     FROM monitors m
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS checks_24h,
              ROUND(100.0 * COUNT(*) FILTER (WHERE c.ok) / NULLIF(COUNT(*), 0), 2)::float AS uptime_24h,
              ROUND(AVG(c.response_time_ms) FILTER (WHERE c.ok))::int AS avg_response_24h
       FROM checks c
       WHERE c.monitor_id = m.id AND c.checked_at > now() - interval '24 hours'
     ) s ON true
     LEFT JOIN LATERAL (
       SELECT c.checked_at, c.response_time_ms
       FROM checks c WHERE c.monitor_id = m.id
       ORDER BY c.checked_at DESC LIMIT 1
     ) lc ON true
     WHERE m.user_id = $1
     ORDER BY m.created_at DESC`,
    [req.userId]
  );
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const result = await pool.query(
    `SELECT ${FIELDS} FROM monitors WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.userId]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

router.post('/', async (req, res) => {
  const parsed = monitorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const count = await pool.query(
    'SELECT COUNT(*)::int AS n FROM monitors WHERE user_id = $1',
    [req.userId]
  );
  if (count.rows[0].n >= MAX_MONITORS_PER_USER) {
    return res
      .status(400)
      .json({ error: `You can have at most ${MAX_MONITORS_PER_USER} monitors` });
  }

  const m = parsed.data;
  const result = await pool.query(
    `INSERT INTO monitors
       (user_id, name, url, interval_seconds, timeout_ms, expected_status, is_paused)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${FIELDS}`,
    [req.userId, m.name, m.url, m.interval_seconds, m.timeout_ms, m.expected_status, m.is_paused]
  );
  res.status(201).json(result.rows[0]);
});

router.put('/:id', async (req, res) => {
  const parsed = monitorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const m = parsed.data;

  const result = await pool.query(
    `UPDATE monitors
     SET name = $1, url = $2, interval_seconds = $3, timeout_ms = $4,
         expected_status = $5, is_paused = $6
     WHERE id = $7 AND user_id = $8
     RETURNING ${FIELDS}`,
    [m.name, m.url, m.interval_seconds, m.timeout_ms, m.expected_status,
     m.is_paused, req.params.id, req.userId]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  const result = await pool.query(
    'DELETE FROM monitors WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

 
router.get('/:id/checks', async (req, res) => {
  if (!(await ownsMonitor(req.params.id, req.userId))) {
    return res.status(404).json({ error: 'Not found' });
  }
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const result = await pool.query(
    `SELECT id, checked_at, status_code, response_time_ms, ok, error
     FROM checks WHERE monitor_id = $1
     ORDER BY checked_at DESC LIMIT $2`,
    [req.params.id, limit]
  );
  res.json(result.rows);
});

 
const uptimeSql = (label, interval) => `
  ROUND(100.0 * COUNT(*) FILTER (WHERE ok AND checked_at > now() - interval '${interval}')
        / NULLIF(COUNT(*) FILTER (WHERE checked_at > now() - interval '${interval}'), 0), 2)::float
        AS uptime_${label}`;

router.get('/:id/stats', async (req, res) => {
  if (!(await ownsMonitor(req.params.id, req.userId))) {
    return res.status(404).json({ error: 'Not found' });
  }
  const result = await pool.query(
    `SELECT
       ${uptimeSql('24h', '24 hours')},
       ${uptimeSql('7d', '7 days')},
       ${uptimeSql('30d', '30 days')},
       COUNT(*) FILTER (WHERE checked_at > now() - interval '24 hours')::int AS checks_24h,
       ROUND(AVG(response_time_ms) FILTER (WHERE ok AND checked_at > now() - interval '24 hours'))::int
         AS avg_response_24h,
       ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms)
         FILTER (WHERE ok AND checked_at > now() - interval '24 hours'))::numeric)::int
         AS p95_response_24h
     FROM checks
     WHERE monitor_id = $1 AND checked_at > now() - interval '30 days'`,
    [req.params.id]
  );
  res.json(result.rows[0]);
});

 
const RANGES = {
  '24h': { window: '24 hours', bucket: '10 minutes' },
  '7d': { window: '7 days', bucket: '1 hour' },
  '30d': { window: '30 days', bucket: '6 hours' },
};

router.get('/:id/response-times', async (req, res) => {
  if (!(await ownsMonitor(req.params.id, req.userId))) {
    return res.status(404).json({ error: 'Not found' });
  }
  const range = Object.hasOwn(RANGES, req.query.range)
    ? RANGES[req.query.range]
    : RANGES['24h'];

  const result = await pool.query(
    `SELECT date_bin($2::interval, checked_at, TIMESTAMPTZ '2000-01-01') AS bucket,
            ROUND(AVG(response_time_ms) FILTER (WHERE ok))::int AS avg_ms,
            COUNT(*)::int AS checks,
            COUNT(*) FILTER (WHERE NOT ok)::int AS failures
     FROM checks
     WHERE monitor_id = $1 AND checked_at > now() - $3::interval
     GROUP BY bucket
     ORDER BY bucket`,
    [req.params.id, range.bucket, range.window]
  );
  res.json(result.rows);
});

export default router;