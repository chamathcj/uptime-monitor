import { pool } from './db.js';
import { checkMonitor } from './checker.js';
import { notifyDown, notifyRecovered } from './notify.js';

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

 
export async function recordResult(monitor, result) {
  const client = await pool.connect();
  let event = null;

  try {
    await client.query('BEGIN');

     
    const locked = await client.query(
      `SELECT m.id, m.name, m.url, m.consecutive_failures, m.failure_threshold,
              m.alerts_enabled, u.email
       FROM monitors m
       JOIN users u ON u.id = m.user_id
       WHERE m.id = $1
       FOR UPDATE OF m`,
      [monitor.id]
    );
    if (locked.rowCount === 0) {
       
      await client.query('ROLLBACK');
      return;
    }
    const m = locked.rows[0];

    await client.query(
      `INSERT INTO checks (monitor_id, status_code, response_time_ms, ok, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [m.id, result.statusCode, result.responseTimeMs, result.ok, result.error]
    );

    if (result.ok) {
      await client.query(
        `UPDATE monitors SET status = 'up', consecutive_failures = 0 WHERE id = $1`,
        [m.id]
      );
      const closed = await client.query(
        `UPDATE incidents SET resolved_at = now()
         WHERE monitor_id = $1 AND resolved_at IS NULL
         RETURNING started_at, resolved_at`,
        [m.id]
      );
      if (closed.rowCount > 0 && m.alerts_enabled) {
        event = {
          type: 'recovered',
          monitor: m,
          startedAt: closed.rows[0].started_at,
          resolvedAt: closed.rows[0].resolved_at,
        };
      }
    } else {
      const failures = m.consecutive_failures + 1;

      if (failures >= m.failure_threshold) {
        await client.query(
          `UPDATE monitors SET status = 'down', consecutive_failures = $2 WHERE id = $1`,
          [m.id, failures]
        );
         
        const opened = await client.query(
          `INSERT INTO incidents (monitor_id, reason) VALUES ($1, $2)
           ON CONFLICT (monitor_id) WHERE resolved_at IS NULL DO NOTHING
           RETURNING started_at`,
          [m.id, result.error]
        );
        if (opened.rowCount > 0 && m.alerts_enabled) {
          event = {
            type: 'down',
            monitor: m,
            failures,
            reason: result.error,
            startedAt: opened.rows[0].started_at,
          };
        }
      } else {
         
        await client.query(
          `UPDATE monitors SET consecutive_failures = $2 WHERE id = $1`,
          [m.id, failures]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  if (event) notify(event);
}

 
function notify(event) {
  const send = event.type === 'down' ? notifyDown(event) : notifyRecovered(event);
  send.catch((err) => console.error('Alert failed:', err.message));
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
  console.log(`Scheduler started (mail mode: ${process.env.MAIL_MODE || 'console'})`);
  tick();
  cleanupOldChecks();
  setInterval(cleanupOldChecks, 60 * 60 * 1000).unref();
}

export function stopScheduler() {
  stopped = true;
  clearTimeout(timer);
}