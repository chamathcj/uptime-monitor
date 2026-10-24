import { pool } from './db.js';
import { checkMonitor } from './checker.js';

const TICK_MS = 5000;         
const BATCH_SIZE = 20;       
const CONCURRENCY = 5;        
const RETENTION_DAYS = 30;    

let timer = null;
let stopped = false;

 
async function claimDueMonitors() {
  const result = await pool.query(
    `UPDATE monitors m
     SET next_check_at = now() + make_interval(secs => m.interval_seconds)
     FROM (
       SELECT id FROM monitors
       WHERE NOT is_paused AND next_check_at <= now()
       ORDER BY next_check_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     ) due
     WHERE m.id = due.id
     RETURNING m.id, m.url, m.timeout_ms, m.expected_status`,
    [BATCH_SIZE]
  );
  return result.rows;
}

async function recordResult(monitor, result) {
  await pool.query(
    `INSERT INTO checks (monitor_id, status_code, response_time_ms, ok, error)
     VALUES ($1, $2, $3, $4, $5)`,
    [monitor.id, result.statusCode, result.responseTimeMs, result.ok, result.error]
  );
   
  await pool.query(
    `UPDATE monitors
     SET status = CASE WHEN $2::boolean THEN 'up' ELSE 'down' END,
         consecutive_failures = CASE WHEN $2::boolean THEN 0 ELSE consecutive_failures + 1 END
     WHERE id = $1`,
    [monitor.id, result.ok]
  );
}

async function runOne(monitor) {
  try {
    const result = await checkMonitor(monitor);
    await recordResult(monitor, result);
  } catch (err) {
     
    console.error(`Check failed for monitor ${monitor.id}:`, err.message);
  }
}

async function tick() {
  let delay = TICK_MS;
  try {
    const due = await claimDueMonitors();
    for (let i = 0; i < due.length; i += CONCURRENCY) {
      await Promise.all(due.slice(i, i + CONCURRENCY).map(runOne));
    }
    if (due.length === BATCH_SIZE) delay = 0;  
  } catch (err) {
    console.error('Scheduler error:', err.message);
  }
  if (!stopped) timer = setTimeout(tick, delay);
}

async function cleanupOldChecks() {
  try {
    const result = await pool.query(
      `DELETE FROM checks WHERE checked_at < now() - make_interval(days => $1)`,
      [RETENTION_DAYS]
    );
    if (result.rowCount > 0) console.log(`Deleted ${result.rowCount} old checks`);
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

export function startScheduler() {
  stopped = false;
  console.log('Scheduler started');
  tick();
  cleanupOldChecks();
  setInterval(cleanupOldChecks, 60 * 60 * 1000).unref();
}

export function stopScheduler() {
  stopped = true;
  clearTimeout(timer);
}