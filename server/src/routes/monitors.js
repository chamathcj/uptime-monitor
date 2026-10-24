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

router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT ${FIELDS} FROM monitors WHERE user_id = $1 ORDER BY created_at DESC`,
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

export default router;