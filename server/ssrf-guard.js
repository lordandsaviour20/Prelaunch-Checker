const dns = require('dns').promises;
const ipRangeCheck = require('ip-range-check');

const BLOCKED_RANGES = [
  '127.0.0.0/8',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  '0.0.0.0/8',
  '100.64.0.0/10',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
];

const BLOCKED_IPS = ['169.254.169.254', 'metadata.google.internal'];

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /^.*\.internal$/i,
  /^metadata\./i,
];

function hasBlockedHostnamePattern(hostname) {
  return BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname));
}

async function assertUrlIsSafe(rawUrl) {
  const parsed = new URL(rawUrl);
  const hostname = parsed.hostname;

  if (BLOCKED_IPS.includes(hostname) || hasBlockedHostnamePattern(hostname)) {
    throw new Error('This URL points to a restricted host and cannot be checked.');
  }

  let addresses;
  try {
    const results = await dns.lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch (err) {
    throw new Error('Could not resolve this URL\'s hostname.');
  }

  for (const address of addresses) {
    if (BLOCKED_IPS.includes(address) || ipRangeCheck(address, BLOCKED_RANGES)) {
      throw new Error('This URL resolves to a restricted network address and cannot be checked.');
    }
  }
}

module.exports = { assertUrlIsSafe };