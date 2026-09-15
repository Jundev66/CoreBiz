import { Injectable } from '@nestjs/common';
import { databaseIsReachable } from '@corebiz/infrastructure';
import { loadEnv } from '../config/env';

export interface HealthReport {
  readonly status: 'ok' | 'degraded';
  readonly driver: 'postgres' | 'memory';
  readonly database: 'reachable' | 'unreachable' | 'not-applicable';
}

/**
 * How long one probe answers for everyone.
 *
 * `/health` is public and skips auth, so without this every call was a query against a pool
 * of three connections: a loop against it took every company offline and, with the API
 * slow to answer, turned off the sign-in rate limit on the web side. Ten seconds is what the
 * web's own `/api/health` already caches, and nothing that polls health needs fresher.
 */
const CACHE_MS = 10_000;

let cached: { readonly report: HealthReport; readonly at: number } | null = null;
let inFlight: Promise<HealthReport> | null = null;

/**
 * Health check that TOUCHES the database.
 *
 * A health check that only answers "the process is alive" is worse than none: it stays
 * green while the application cannot serve a single screen. The post-deploy check uses it
 * to tell whether the chain works, and the keepalive uses it so Supabase does not pause the
 * project for inactivity — both need the query to reach Postgres.
 *
 * At most one probe per instance every `CACHE_MS`, and concurrent callers share the probe
 * in flight instead of each opening their own.
 */
@Injectable()
export class HealthService {
  async check(): Promise<HealthReport> {
    const env = loadEnv();

    if (env.DATA_DRIVER === 'memory') {
      return { status: 'ok', driver: 'memory', database: 'not-applicable' };
    }

    if (cached !== null && Date.now() - cached.at < CACHE_MS) return cached.report;

    inFlight ??= probe(env.DATABASE_URL ?? '').finally(() => {
      inFlight = null;
    });
    return inFlight;
  }
}

async function probe(url: string): Promise<HealthReport> {
  const reachable = await databaseIsReachable(url);
  const report: HealthReport = {
    status: reachable ? 'ok' : 'degraded',
    driver: 'postgres',
    database: reachable ? 'reachable' : 'unreachable',
  };
  cached = { report, at: Date.now() };
  return report;
}
