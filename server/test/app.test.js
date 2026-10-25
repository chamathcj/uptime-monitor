import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

test('the health endpoint responds', async () => {
  const res = await request(createApp({ rateLimits: false })).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('security headers are set and the framework is not advertised', async () => {
  const res = await request(createApp({ rateLimits: false })).get('/health');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('unknown routes return a JSON 404', async () => {
  const res = await request(createApp({ rateLimits: false })).get('/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Not found');
});

test('malformed JSON returns 400, not 500', async () => {
  const res = await request(createApp({ rateLimits: false }))
    .post('/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"email": ');
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid JSON');
});

test('oversized request bodies are rejected', async () => {
  const res = await request(createApp({ rateLimits: false }))
    .post('/auth/login')
    .send({ email: 'a@b.co', password: 'x'.repeat(20000) });
  assert.equal(res.status, 413);
});

test('login is rate limited', async () => {
  const app = createApp({ rateLimits: true });
  let last;
  for (let i = 0; i < 21; i++) {
    last = await request(app).post('/auth/login').send({});
  }
  assert.equal(last.status, 429);
  assert.match(last.body.error, /Too many/);
});