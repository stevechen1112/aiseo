import { lookup } from 'node:dns/promises';
import net from 'node:net';

function isPrivateIpv4(ip: string) {
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];

  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fe80:')) return true; // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
  return false;
}

function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true;
}

export async function assertSafeOutboundUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    const error = new Error('Invalid URL');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    const error = new Error('Only http/https URLs are allowed');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }

  const hostname = url.hostname.trim().toLowerCase();
  if (!hostname) {
    const error = new Error('Invalid URL host');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    const error = new Error('Blocked URL host');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }

  // If hostname is already an IP literal, validate directly.
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      const error = new Error('Blocked URL IP');
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }
    return;
  }

  // Resolve hostname to IPs and block private ranges.
  const addrs = await lookup(hostname, { all: true });
  if (!addrs || addrs.length === 0) {
    const error = new Error('Unable to resolve host');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }

  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      const error = new Error('Blocked URL IP');
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }
  }
}
