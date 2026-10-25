import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { recordResult } from '../src/scheduler.js';
import { registerUser, createMonitor, cleanup } from './helpers.js';

const app = createApp({ rateLimits: false });
after(cleanup);

const FAIL = { ok: false, statusCode: 500, responseTimeMs: 50, error: 'Expected 200, got 500' };
const PASS = { ok: true, statusCode: 200, responseTimeMs: 40, error: null };

async function setup(failure_threshold) {
  const user = await registerUser(app);
  const { body } = await createMonitor(app, user.auth, { failure_threshold });
  return { user, id: body.id };
}

async function state({ user, id }) {
  const monitor = await request(app).get(`/monitors/${id}`).set(user.auth);
  const incidents = await request(app).get(`/monitors/${id}/incidents`).set(user.auth);
  return { monitor: monitor.body, incidents: incidents.body };
}

test('a monitor is only declared down after enough failures in a row', async () => {
  const ctx = await setup(2);

  await recordResult({ id: ctx.id }, FAIL);
  let s = await state(ctx);
  assert.notEqual(s.monitor.status, 'down');
  assert.equal(s.monitor.consecutive_failures, 1);
  assert.equal(s.incidents.length, 0);

  await recordResult({ id: ctx.id }, FAIL);
  s = await state(ctx);
  assert.equal(s.monitor.status, 'down');
  assert.equal(s.incidents.length, 1);
  assert.equal(s.incidents[0].resolved_at, null);
  assert.equal(s.incidents[0].reason, 'Expected 200, got 500');
});

test('further failures do not open a second incident', async () => {
  const ctx = await setup(1);
  for (let i = 0; i < 4; i++) await recordResult({ id: ctx.id }, FAIL);
  const s = await state(ctx);
  assert.equal(s.monitor.status, 'down');
  assert.equal(s.incidents.length, 1);
});

test('a success closes the incident and a new outage opens a new one', async () => {
  const ctx = await setup(1);

  await recordResult({ id: ctx.id }, FAIL);
  await recordResult({ id: ctx.id }, PASS);
  let s = await state(ctx);
  assert.equal(s.monitor.status, 'up');
  assert.equal(s.monitor.consecutive_failures, 0);
  assert.equal(s.incidents.length, 1);
  assert.notEqual(s.incidents[0].resolved_at, null);

  await recordResult({ id: ctx.id }, FAIL);
  s = await state(ctx);
  assert.equal(s.monitor.status, 'down');
  assert.equal(s.incidents.length, 2);
  assert.equal(s.incidents[0].resolved_at, null); 
});

test('a success resets the failure streak', async () => {
  const ctx = await setup(3);
  for (const result of [FAIL, FAIL, PASS, FAIL, FAIL]) {
    await recordResult({ id: ctx.id }, result);
  }
  const s = await state(ctx);
  assert.notEqual(s.monitor.status, 'down');
  assert.equal(s.monitor.consecutive_failures, 2);
  assert.equal(s.incidents.length, 0);
});

test('every result is stored as a check', async () => {
  const ctx = await setup(3);
  await recordResult({ id: ctx.id }, PASS);
  await recordResult({ id: ctx.id }, FAIL);

  const res = await request(app).get(`/monitors/${ctx.id}/checks`).set(ctx.user.auth);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.deepEqual(res.body.map((c) => c.ok).sort(), [false, true]);
});

test('a result for a deleted monitor is ignored without crashing', async () => {
  await assert.doesNotReject(() => recordResult({ id: 2147483647 }, PASS));
});