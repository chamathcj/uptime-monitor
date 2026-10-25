import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { pool } from '../src/db.js';

if (process.env.NODE_ENV !== 'test') {
  throw new Error('Refusing to run: NODE_ENV is not "test". Run the tests with npm test.');
}

export async function registerUser(app) {
  const email = `${randomUUID()}@test.invalid`;
  const res = await request(app)
    .post('/auth/register')
    .send({ email, password: 'password123' });
  if (res.status !== 201) {
    throw new Error(`Could not register test user: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { email, auth: { Authorization: `Bearer ${res.body.token}` } };
}

export function createMonitor(app, auth, overrides = {}) {
  return request(app)
    .post('/monitors')
    .set(auth)
    .send({
      name: 'Test monitor',
      url: 'https://example.com',
      interval_seconds: 60,
      ...overrides,
    });
}


export async function cleanup() {
  await pool.query("DELETE FROM users WHERE email LIKE '%@test.invalid'");
  await pool.end();
}