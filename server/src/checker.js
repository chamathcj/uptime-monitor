import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

function isPrivateIPv4(ip) {
  const [a, b, c] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    if (v.startsWith('::ffff:')) {
      const rest = v.slice(7);
      return net.isIPv4(rest) ? isPrivateIPv4(rest) : true;
    }
    return /^(fc|fd|fe[89ab])/.test(v);
  }
  return true;
}

 
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    if (addresses.some((a) => isPrivateAddress(a.address))) {
      return callback(new Error('Blocked: host resolves to a private address'));
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

 
export function checkMonitor(monitor) {
  return new Promise((resolve) => {
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    let settled = false;
    let hardTimer;

    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      resolve(result);
    };
    const fail = (message) =>
      done({ ok: false, statusCode: null, responseTimeMs: elapsed(), error: message });

    let url;
    try {
      url = new URL(monitor.url);
    } catch {
      return fail('Invalid URL');
    }

     
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && isPrivateAddress(host)) {
      return fail('Blocked: private address');
    }

    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup,
        headers: { 'User-Agent': 'UptimeMonitorBot/1.0', Accept: '*/*' },
      },
      (res) => {
         
        const responseTimeMs = elapsed();
        res.destroy(); 
        const ok = res.statusCode === monitor.expected_status;
        done({
          ok,
          statusCode: res.statusCode,
          responseTimeMs,
          error: ok ? null : `Expected ${monitor.expected_status}, got ${res.statusCode}`,
        });
      }
    );

     
    hardTimer = setTimeout(
      () => req.destroy(new Error(`Timed out after ${monitor.timeout_ms} ms`)),
      monitor.timeout_ms
    );

    req.on('error', (err) => fail((err.message || 'Request failed').slice(0, 300)));
    req.end();
  });
}