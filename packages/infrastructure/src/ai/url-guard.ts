import { lookup } from 'node:dns/promises';
import { checkBaseUrl, isPrivateAddress } from '@corebiz/domain';

export type ResolveHost = (hostname: string) => Promise<readonly string[]>;

export const resolveWithDns: ResolveHost = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

/**
 * Whether the API may call this address.
 *
 * The domain rules decide by spelling; this adds the resolved addresses, because
 * `ollama.attacker.example` can point at 10.0.0.1 just as well as a literal can. A name that
 * does not resolve is refused too: it could not be called anyway, and "unreachable" is a
 * more honest answer than trying.
 *
 * What remains is DNS rebinding — a name that resolves to a public address here and to a
 * private one a millisecond later, when `fetch` resolves it again. Closing that needs pinning
 * the connection to the checked address, which `fetch` does not offer. Recorded in
 * `docs/THREAT_MODEL.md` rather than pretended away; redirects are refused for the same
 * reason (see the gateway).
 */
export async function isAllowedBaseUrl(
  raw: string,
  allowPrivate: boolean,
  resolve: ResolveHost = resolveWithDns,
): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (!checkBaseUrl(url, allowPrivate).ok) return false;
  if (allowPrivate) return true;

  try {
    const addresses = await resolve(url.hostname.replace(/^\[/, '').replace(/\]$/, ''));
    return addresses.length > 0 && !addresses.some(isPrivateAddress);
  } catch {
    return false;
  }
}
