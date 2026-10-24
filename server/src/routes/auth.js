import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../db.js';

const router = Router();

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const signToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

router.post('/register', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, password } = parsed.data;

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email.toLowerCase(), hash]
    );
    res.status(201).json({ token: signToken(result.rows[0].id) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }
});

router.post('/login', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, password } = parsed.data;

  const result = await pool.query(
    'SELECT id, password_hash FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  const user = result.rows[0];
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  res.json({ token: signToken(user.id) });
});

export default router;