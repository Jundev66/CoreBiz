import { Injectable } from '@nestjs/common';
import { databaseIsReachable } from '@corebiz/infrastructure';
import { loadEnv } from '../config/env';

export interface HealthReport {
  readonly status: 'ok' | 'degraded';
  readonly driver: 'postgres' | 'memory';
  readonly database: 'reachable' | 'unreachable' | 'not-applicable';
}

/**
 * Health check that TOUCHES the database.
 *
 * A health check that only answers "the process is alive" is worse than none: it stays
 * green while the application cannot serve a single screen. The post-deploy check uses it
 * to tell whether the chain works, and the keepalive uses it so Supabase does not pause the
 * project for inactivity — both need the query to reach Postgres.
 */
@Injectable()
export class HealthService {
  async check(): Promise<HealthReport> {
    const env = loadEnv();

    if (env.DATA_DRIVER === 'memory') {
      return { status: 'ok', driver: 'memory', database: 'not-applicable' };
    }

    const reachable = await databaseIsReachable(env.DATABASE_URL ?? '');
    return {
      status: reachable ? 'ok' : 'degraded',
      driver: 'postgres',
      database: reachable ? 'reachable' : 'unreachable',
    };
  }
}
