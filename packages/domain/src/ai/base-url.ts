import { err, ok, type Result } from '../shared/result';

/**
 * Which addresses the API may be told to call.
 *
 * The base URL is typed by a person, and the request to it leaves FROM OUR SERVER. Without
 * this, "Ollama at http://169.254.169.254" is a way to make the API read its own cloud
 * metadata, and "http://localhost:5432" a way to probe the database port. That is SSRF, and
 * an admin of one company must not be able to do it to the platform.
 *
 * This is the syntactic half: scheme, credentials in the URL, and hosts that are private by
 * their literal spelling. A public-looking name can still RESOLVE to a private address, so
 * the adapter checks the resolved addresses again before connecting.
 *
 * `allowPrivate` exists for local development and the test suite, where Ollama really is on
 * localhost. It is an environment switch, never a per-company setting.
 */

export type BaseUrlError = { kind: 'AiBaseUrlNotAllowed' };

/**
 * The parts of an address this policy looks at.
 *
 * The domain has no `URL` (it runs without DOM or Node types on purpose), so the caller
 * parses and hands over the pieces. Parsing twice with different rules is how SSRF filters
 * get bypassed, so the adapter passes exactly what WHATWG `URL` produced.
 */
export interface UrlParts {
  readonly protocol: string;
  readonly hostname: string;
  readonly username: string;
  readonly password: string;
}

export function checkBaseUrl(url: UrlParts, allowPrivate: boolean): Result<true, BaseUrlError> {
  if (url.username !== '' || url.password !== '') return err({ kind: 'AiBaseUrlNotAllowed' });

  if (allowPrivate) {
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? ok(true)
      : err({ kind: 'AiBaseUrlNotAllowed' });
  }

  if (url.protocol !== 'https:') return err({ kind: 'AiBaseUrlNotAllowed' });
  if (isPrivateHost(url.hostname)) return err({ kind: 'AiBaseUrlNotAllowed' });
  return ok(true);
}

/** Hostnames and literal addresses that never reach the public internet. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  // A bare name like `db` resolves through the platform's own search domains.
  if (!host.includes('.') && !host.includes(':')) return true;

  const v4 = parseIpv4(host);
  if (v4 !== null) return isPrivateIpv4(v4);
  if (host.includes(':')) return isPrivateIpv6(host);
  return false;
}

/** Whether a resolved address, of either family, is private. */
export function isPrivateAddress(address: string): boolean {
  const v4 = parseIpv4(address);
  if (v4 !== null) return isPrivateIpv4(v4);
  return isPrivateIpv6(address);
}

function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? octets : null;
}

function isPrivateIpv4(octets: readonly number[]): boolean {
  const [a, b] = octets;
  if (a === undefined || b === undefined) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, where cloud metadata lives
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::' || h === '::1') return true;
  // IPv4-mapped (::ffff:10.0.0.1) inherits the verdict of the embedded address. The URL
  // parser rewrites it to hex (::ffff:a00:1), so both spellings are handled.
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (dotted?.[1] !== undefined) {
    const v4 = parseIpv4(dotted[1]);
    return v4 === null || isPrivateIpv4(v4);
  }
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (hex?.[1] !== undefined && hex[2] !== undefined) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return isPrivateIpv4([high >> 8, high & 0xff, low >> 8, low & 0xff]);
  }
  return h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('ff');
}
