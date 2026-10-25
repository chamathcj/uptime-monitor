import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { cleanup } from './helpers.js';

const app = createApp({ rateLimits: false });
after(cleanup);

const newEmail = () => `${randomUUID()}@test.invalid`;
const credentials = (email) => ({ email, password: 'password123' });

test('register returns a token', async () => {
  const res = await request(app).post('/auth/register').send(credentials(newEmail()));
  assert.equal(res.status, 201);
  assert.ok(res.body.token);
});

test('registering the same email twice returns 409, whatever the letter case', async () => {
  const email = newEmail();
  await request(app).post('/auth/register').send(credentials(email));
  const again = await request(app).post('/auth/register').send(credentials(email.toUpperCase()));
  assert.equal(again.status, 409);
});

test('a short password is rejected', async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: newEmail(), password: 'short' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /at least 8/);
});

test('an invalid email is rejected', async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'not-an-email', password: 'password123' });
  assert.equal(res.status, 400);
});

test('passwords are stored hashed, never in plain text', async () => {
  const email = newEmail();
  await request(app).post('/auth/register').send(credentials(email));
  const row = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);
  assert.notEqual(row.rows[0].password_hash, 'password123');
  assert.match(row.rows[0].password_hash, /^\$2[aby]\$/);
});

test('login works with the right password', async () => {
  const email = newEmail();
  await request(app).post('/auth/register').send(credentials(email));
  const res = await request(app).post('/auth/login').send(credentials(email));
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
});

test('wrong password and unknown email give the same error', async () => {
  const email = newEmail();
  await request(app).post('/auth/register').send(credentials(email));

  const wrong = await request(app)
    .post('/auth/login')
    .send({ email, password: 'wrong-password' });
  const unknown = await request(app).post('/auth/login').send(credentials(newEmail()));

  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.error, unknown.body.error);
});

test('protected routes need a valid token', async () => {
  const none = await request(app).get('/monitors');
  assert.equal(none.status, 401);

  const garbage = await request(app).get('/monitors').set('Authorization', 'Bearer not.a.token');
  assert.equal(garbage.status, 401);

  const noStatusPage = await request(app).get('/status-page');
  assert.equal(noStatusPage.status, 401);
});