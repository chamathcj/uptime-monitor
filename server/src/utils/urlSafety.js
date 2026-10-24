function isPrivateIPv4(host) {
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

// Returns an error message if the URL is not allowed, otherwise null
export function checkUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return 'Invalid URL';
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'Only http and https URLs are allowed';
  }

  const host = url.hostname.toLowerCase();

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.startsWith('[') // IPv6 literals
  ) {
    return 'That address is not allowed';
  }

  if (isPrivateIPv4(host)) {
    return 'Private IP addresses are not allowed';
  }

  return null;
}