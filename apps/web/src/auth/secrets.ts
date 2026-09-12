import 'server-only';

/**
 * A secret the web tier cannot run without in production.
 *
 * Several secrets used to fall back silently to a value written in this repository when
 * they were missing. With a public repository that fallback is not a convenience, it is
 * a published key: `REQUEST_HASH_SECRET` unset in production meant IP hashes salted with
 * a string anyone can read, i.e. reversible by walking the IPv4 space.
 *
 * So in production a missing secret FAILS CLOSED: the request errors, the log names the
 * variable, and nobody gets a deployment that looks healthy while running on a public
 * key. Outside production the development fallback keeps `pnpm dev` working with no setup.
 *
 * `next start` runs with `NODE_ENV=production`, so the E2E suite sets these variables
 * explicitly in `e2e/playwright.config.ts`.
 */
export function requiredSecret(name: string, developmentFallback: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${name} is not set. It is required in production: see docs/DEPLOY.md (Vercel variables).`,
    );
  }

  return developmentFallback;
}

/** Development-only salt for `REQUEST_HASH_SECRET`. Never used in production. */
export const DEVELOPMENT_HASH_SECRET = 'corebiz-sal-local';
