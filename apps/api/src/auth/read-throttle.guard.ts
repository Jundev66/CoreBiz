import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { inMemoryRateLimiter, type RateLimiter } from '@corebiz/application';
import { loadEnv } from '../config/env';
import { domainError } from '../http/api-error';
import type { AuthenticatedRequest } from './authenticated-request';

const READ_METHODS = new Set(['GET', 'HEAD']);

/**
 * One minute. Not in `RATE_LIMITS` on purpose: those are ceilings on ATTEMPTS against
 * brute force, all held under ten a minute by a test. This one bounds volume, and a person
 * paging through a list legitimately makes far more reads than that.
 */
const READ_WINDOW_SECONDS = 60;

/**
 * A ceiling on how fast one verified user can READ through the API.
 *
 * `WriteThrottleGuard` left reads uncounted because they cost no storage. They do cost
 * connections: every read holds one of the instance's three for a whole transaction, and
 * a loop of GETs with any valid token — the credentials a demo visitor receives are enough —
 * queued every other company behind it.
 *
 * Counted IN MEMORY, per instance, and that is a decision rather than a shortcut. A counter
 * in Postgres would spend a query per read to protect the database from too many queries.
 * Per instance it does not bound the whole fleet, but it bounds what one token can take from
 * the instance serving it, which is where the pool lives.
 *
 * Registered as a global guard without request scope, like `WriteThrottleGuard`: it only
 * reads the request object. Routes excluded from auth carry no identity and are skipped.
 */
@Injectable()
export class ReadThrottleGuard implements CanActivate {
  private readonly limiter: RateLimiter = inMemoryRateLimiter();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!READ_METHODS.has(req.method) || req.auth === undefined) return true;

    const decision = await this.limiter.hit(
      `apiRead:${req.auth.userId}`,
      loadEnv().API_READS_PER_MINUTE,
      READ_WINDOW_SECONDS,
    );

    if (decision.allowed) return true;
    throw domainError('TooManyAttempts', { retryAfter: decision.retryAfterSeconds });
  }
}
