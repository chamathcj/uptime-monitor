import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { registerUser, createMonitor, cleanup } from './helpers.js';

const app = createApp({ rateLimits: false });
after(cleanup);

test('creating a monitor returns it with sensible defaults', async () => {
  const user = await registerUser(app);
  const res = await createMonitor(app, user.auth, { name: 'Site' });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'Site');
  assert.equal(res.body.status, 'pending');
  assert.equal(res.body.failure_threshold, 3);
  assert.equal(res.body.alerts_enabled, true);
  assert.equal(res.body.show_on_status_page, false);
});

test('unsafe URLs are rejected', async () => {
  const user = await registerUser(app);
  for (const url of [
    'http://localhost:5000',
    'http://127.0.0.1',
    'http://10.0.0.5',
    'http://192.168.1.1',
    'http://169.254.169.254/latest',
    'ftp://example.com',
    'javascript:alert(1)',
  ]) {
    const res = await createMonitor(app, user.auth, { url });
    assert.equal(res.status, 400, url);
  }
});

test('invalid settings are rejected', async () => {
  const user = await registerUser(app);
  assert.equal((await createMonitor(app, user.auth, { interval_seconds: 5 })).status, 400);
  assert.equal((await createMonitor(app, user.auth, { failure_threshold: 0 })).status, 400);
  assert.equal((await createMonitor(app, user.auth, { name: '' })).status, 400);
});

test("users cannot see or change each other's monitors", async () => {
  const alice = await registerUser(app);
  const bob = await registerUser(app);
  const { body: monitor } = await createMonitor(app, alice.auth);
  const id = monitor.id;

  const get = await request(app).get(`/monitors/${id}`).set(bob.auth);
  assert.equal(get.status, 404);

  const put = await request(app)
    .put(`/monitors/${id}`)
    .set(bob.auth)
    .send({ name: 'Hacked', url: 'https://example.org' });
  assert.equal(put.status, 404);

  const patch = await request(app)
    .patch(`/monitors/${id}`)
    .set(bob.auth)
    .send({ is_paused: true });
  assert.equal(patch.status, 404);

  const del = await request(app).delete(`/monitors/${id}`).set(bob.auth);
  assert.equal(del.status, 404);

  for (const sub of ['checks', 'stats', 'incidents', 'response-times']) {
    const res = await request(app).get(`/monitors/${id}/${sub}`).set(bob.auth);
    assert.equal(res.status, 404, sub);
  }

  const list = await request(app).get('/monitors').set(bob.auth);
  assert.deepEqual(list.body, []);

  const mine = await request(app).get(`/monitors/${id}`).set(alice.auth);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.name, 'Test monitor');
});

test('a non-numeric id returns 404', async () => {
  const user = await registerUser(app);
  assert.equal((await request(app).get('/monitors/abc').set(user.auth)).status, 404);
  assert.equal((await request(app).get('/monitors/abc/checks').set(user.auth)).status, 404);
});

test('pausing and resuming works', async () => {
  const user = await registerUser(app);
  const { body } = await createMonitor(app, user.auth);

  const paused = await request(app)
    .patch(`/monitors/${body.id}`)
    .set(user.auth)
    .send({ is_paused: true });
  assert.equal(paused.status, 200);
  assert.equal(paused.body.is_paused, true);

  const resumed = await request(app)
    .patch(`/monitors/${body.id}`)
    .set(user.auth)
    .send({ is_paused: false });
  assert.equal(resumed.body.is_paused, false);

  const bad = await request(app)
    .patch(`/monitors/${body.id}`)
    .set(user.auth)
    .send({ is_paused: 'yes' });
  assert.equal(bad.status, 400);
});

test('editing a monitor schedules an immediate check', async () => {
  const user = await registerUser(app);
  const { body } = await createMonitor(app, user.auth);

  await pool.query(
    "UPDATE monitors SET next_check_at = now() + interval '1 hour' WHERE id = $1",
    [body.id]
  );
  let row = await pool.query(
    'SELECT next_check_at > now() AS later FROM monitors WHERE id = $1',
    [body.id]
  );
  assert.equal(row.rows[0].later, true);

  const res = await request(app)
    .put(`/monitors/${body.id}`)
    .set(user.auth)
    .send({ name: 'Renamed', url: 'https://example.org', interval_seconds: 60 });
  assert.equal(res.status, 200);

  row = await pool.query(
    'SELECT next_check_at <= now() AS due FROM monitors WHERE id = $1',
    [body.id]
  );
  assert.equal(row.rows[0].due, true);
});

test('a user can have at most 10 monitors', async () => {
  const user = await registerUser(app);
  for (let i = 0; i < 10; i++) {
    const res = await createMonitor(app, user.auth, { name: `Monitor ${i}` });
    assert.equal(res.status, 201);
  }
  const extra = await createMonitor(app, user.auth, { name: 'One too many' });
  assert.equal(extra.status, 400);
  assert.match(extra.body.error, /at most 10/);
});