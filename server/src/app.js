import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import monitorRoutes from './routes/monitors.js';
import statusPageRoutes from './routes/statusPage.js';
import publicRoutes from './routes/public.js';

const limiter = ({ windowMs, limit, message }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });

export function createApp({ rateLimits = true } = {}) {
  const app = express();

  
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY));
  }

  app.use(helmet());

  
  const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(cors({ origin: origins }));

  app.use(express.json({ limit: '10kb' }));

  if (rateLimits) {
    app.use(
      limiter({
        windowMs: 15 * 60 * 1000,
        limit: 1000,
        message: 'Too many requests, please try again later',
      })
    );
    app.use(
      '/auth',
      limiter({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        message: 'Too many login attempts, please try again later',
      })
    );
    app.use(
      '/public',
      limiter({
        windowMs: 60 * 1000,
        limit: 120,
        message: 'Too many requests, please slow down',
      })
    );
  }

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/auth', authRoutes);
  app.use('/monitors', monitorRoutes);
  app.use('/status-page', statusPageRoutes);
  app.use('/public', publicRoutes);

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request too large' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}