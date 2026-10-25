import { sendMail } from './mailer.js';

const clean = (s) => String(s).replace(/[\r\n]+/g, ' ');

function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function notifyDown({ monitor, failures, reason, startedAt }) {
  return sendMail({
    to: monitor.email,
    subject: `[DOWN] ${clean(monitor.name)} is down`,
    text: [
      `Your monitor "${clean(monitor.name)}" is down.`,
      '',
      `URL: ${monitor.url}`,
      `Reason: ${reason || 'Unknown'}`,
      `Failed checks in a row: ${failures}`,
      `Started: ${startedAt.toISOString()}`,
    ].join('\n'),
  });
}

export function notifyRecovered({ monitor, startedAt, resolvedAt }) {
  const duration = formatDuration(resolvedAt - startedAt);
  return sendMail({
    to: monitor.email,
    subject: `[RECOVERED] ${clean(monitor.name)} is back up`,
    text: [
      `Your monitor "${clean(monitor.name)}" is back up.`,
      '',
      `URL: ${monitor.url}`,
      `Downtime: ${duration}`,
      `Started: ${startedAt.toISOString()}`,
      `Resolved: ${resolvedAt.toISOString()}`,
    ].join('\n'),
  });
}