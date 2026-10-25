import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const pageSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/,
      'Address must be 3 to 40 characters: lowercase letters, numbers and hyphens, not starting or ending with a hyphen'
    ),
  title: z.string().trim().min(1, 'Title is required').max(100),
  description: z.string().trim().max(300).default(''),
});

router.get('/', async (req, res) => {
  const result = await pool.query(
    'SELECT slug, title, description FROM status_pages WHERE user_id = $1',
    [req.userId]
  );
  res.json(result.rows[0] ?? null);
});

router.put('/', async (req, res) => {
  const parsed = pageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { slug, title, description } = parsed.data;

  try {
    const result = await pool.query(
      `INSERT INTO status_pages (user_id, slug, title, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET slug = EXCLUDED.slug,
             title = EXCLUDED.title,
             description = EXCLUDED.description
       RETURNING slug, title, description`,
      [req.userId, slug, title, description]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That address is already taken' });
    }
    throw err;
  }
});

export default router;