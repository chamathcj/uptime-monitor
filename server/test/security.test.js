import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUrl } from '../src/utils/urlSafety.js';
import { checkMonitor } from '../src/checker.js';

test('checkUrl allows normal public URLs', () => {
  for (const url of [
    'https://example.com',
    'http://example.com/health',
    'https://api.github.com/status',
    'http://172.15.0.1', 
  ]) {
    assert.equal(checkUrl(url), null, url);
  }
});

test('checkUrl blocks unsafe URLs', () => {
  for (const url of [
    'not a url',
    'ftp://example.com',
    'javascript:alert(1)',
    'http://localhost',
    'http://localhost:5000',
    'http://foo.localhost',
    'http://printer.local',
    'http://db.internal',
    'http://127.0.0.1',
    'http://0.0.0.0',
    'http://10.0.0.1',
    'http://172.16.0.1',
    'http://192.168.1.1',
    'http://169.254.169.254/latest/meta-data',
    'http://2130706433', 
  ]) {
    assert.notEqual(checkUrl(url), null, url);
  }
});

test('the checker refuses private addresses without connecting', async () => {
  for (const url of [
    'http://127.0.0.1:9',
    'http://10.1.2.3:9',
    'http://192.168.0.1:9',
    'http://169.254.169.254',
    'http://[::1]:9',
    'http://[fd00::1]:9',
  ]) {
    const result = await checkMonitor({ url, timeout_ms: 2000, expected_status: 200 });
    assert.equal(result.ok, false, url);
    assert.equal(result.statusCode, null, url);
    assert.match(result.error, /Blocked/, url);
  }
});

test('the checker blocks hostnames that resolve to a private address', async () => {
  const result = await checkMonitor({
    url: 'http://localhost:9',
    timeout_ms: 2000,
    expected_status: 200,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /Blocked/);
});

test('the checker reports invalid URLs', async () => {
  const result = await checkMonitor({ url: 'nonsense', timeout_ms: 2000, expected_status: 200 });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Invalid URL');
});