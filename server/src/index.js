import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import monitorRoutes from './routes/monitors.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRoutes);
app.use('/monitors', monitorRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));