import 'dotenv/config';
import { pool } from './db.js';
import { createApp } from './app.js';
import { startScheduler, stopScheduler } from './scheduler.js';

const app = createApp();

const port = process.env.PORT || 5000;
const server = app.listen(port, () => console.log(`API running on http://localhost:${port}`));


if (process.env.RUN_SCHEDULER !== 'false') startScheduler();

function shutdown() {
  stopScheduler();
  setTimeout(() => process.exit(1), 5000).unref();
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);