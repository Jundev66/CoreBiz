import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { RATE_LIMITS, inMemoryRateLimiter, type RateLimiter } from '@corebiz/application';
import { postgresRateLimiter } from '@corebiz/infrastructure';
import { activeDriver, databaseUrl } from '../config/driver';
import { loadEnv } from '../config/env';
import { domainError } from '../http/api-error';
import type { AuthenticatedRequest } from './authenticated-request';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * A ceiling on how fast one verified user can WRITE through the API.
 *
 * The API is public and every plan is deliberately unlimited, so before this guard a
 * script with any valid token — a free signup, or the credentials a demo visitor receives
 * — could loop create calls until the shared free-tier database was full, taking every
 * company offline at once. RLS keeps each request inside its own company; it does nothing
 * about volume.
 *
 * Per USER and not per IP: the API sits behind Vercel, so the IP it sees is Vercel's, and
 * the only identity it can trust is the verified token. Reads are not counted — they cost
 * no storage, and the screens make several per page.
 *
 * The default (`API_WRITES_PER_HOUR`, 600) is far above what a person at a counter does
 * in an hour and far below what fills a database. It slows abuse; it does not replace
 * quotas, which the product decided not to have.
 *
 * Registered as a global guard WITHOUT request scope, unlike `PermissionsGuard`: it only
 * reads the request object, so it never drags tenant resolution into `/health`. Routes
 * excluded from auth (`health`, `internal`, `demo`) carry no identity and are skipped.
 */
@Injectable()
export class WriteThrottleGuard implements CanActivate {
  private memoryLimiter: RateLimiter | null = null;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (READ_METHODS.has(req.method) || req.auth === undefined) return true;

    const decision = await this.limiter().hit(
      `apiWrite:${req.auth.userId}`,
      loadEnv().API_WRITES_PER_HOUR,
      RATE_LIMITS.apiWrites.windowSeconds,
    );

    if (decision.allowed) return true;
    throw domainError('TooManyAttempts', { retryAfter: decision.retryAfterSeconds });
  }

  /**
   * Postgres in production, so every API instance shares one counter. The in-memory
   * limiter is only for the memory driver, where there is a single process by definition.
   */
  private limiter(): RateLimiter {
    if (activeDriver() !== 'memory') return postgresRateLimiter(databaseUrl());
    this.memoryLimiter ??= inMemoryRateLimiter();
    return this.memoryLimiter;
  }
}
