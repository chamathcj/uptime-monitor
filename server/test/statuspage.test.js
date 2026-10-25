import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { registerUser, createMonitor, cleanup } from './helpers.js';

const app = createApp({ rateLimits: false });
after(cleanup);

const newSlug = () => `t-${randomUUID().slice(0, 8)}`;

test('invalid page addresses are rejected', async () => {
  const user = await registerUser(app);
  for (const slug of ['a', 'ab', 'has space', '-bad-', 'bad_underscore']) {
    const res = await request(app)
      .put('/status-page')
      .set(user.auth)
      .send({ slug, title: 'Title' });
    assert.equal(res.status, 400, slug);
  }
});

test('an address can only be used by one account', async () => {
  const slug = newSlug();
  const first = await registerUser(app);
  const second = await registerUser(app);

  const ok = await request(app)
    .put('/status-page')
    .set(first.auth)
    .send({ slug, title: 'First' });
  assert.equal(ok.status, 200);

  const taken = await request(app)
    .put('/status-page')
    .set(second.auth)
    .send({ slug, title: 'Second' });
  assert.equal(taken.status, 409);
});

test('changing the address keeps a single page per user', async () => {
  const user = await registerUser(app);
  const slugA = newSlug();
  const slugB = newSlug();

  await request(app).put('/status-page').set(user.auth).send({ slug: slugA, title: 'Page' });
  await request(app).put('/status-page').set(user.auth).send({ slug: slugB, title: 'Page' });

  const mine = await request(app).get('/status-page').set(user.auth);
  assert.equal(mine.body.slug, slugB);

  const old = await request(app).get(`/public/status/${slugA}`);
  assert.equal(old.status, 404);
});

test('the public page shows only published, active monitors and hides private details', async () => {
  const owner = await registerUser(app);
  const slug = newSlug();

  const put = await request(app)
    .put('/status-page')
    .set(owner.auth)
    .send({ slug, title: 'Test status', description: 'Hello' });
  assert.equal(put.status, 200);

  await createMonitor(app, owner.auth, {
    name: 'Public site',
    url: 'https://public.example.com',
    show_on_status_page: true,
  });
  await createMonitor(app, owner.auth, {
    name: 'Private site',
    url: 'https://private.example.com',
    show_on_status_page: false,
  });
  const paused = await createMonitor(app, owner.auth, {
    name: 'Paused site',
    url: 'https://paused.example.com',
    show_on_status_page: true,
  });
  await request(app)
    .patch(`/monitors/${paused.body.id}`)
    .set(owner.auth)
    .send({ is_paused: true });

  
  const res = await request(app).get(`/public/status/${slug}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.title, 'Test status');
  assert.deepEqual(res.body.monitors.map((m) => m.name), ['Public site']);
  assert.equal(res.body.monitors[0].days.length, 30);

  const raw = JSON.stringify(res.body);
  for (const secret of ['example.com', owner.email, 'Private site', 'Paused site']) {
    assert.ok(!raw.includes(secret), `leaked: ${secret}`);
  }
});

test('unknown or malformed addresses return 404', async () => {
  assert.equal((await request(app).get('/public/status/does-not-exist-123')).status, 404);
  assert.equal((await request(app).get('/public/status/a_b')).status, 404);
});