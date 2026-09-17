import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { RATE_LIMITS, inMemoryRateLimiter, type RateLimiter } from '@corebiz/application';
import { postgresRateLimiter } from '@corebiz/infrastructure';
import { activeDriver, databaseUrl } from '../config/driver';
import { loadEnv } from '../config/env';
import { domainError } from '../http/api-error';
import type { AuthenticatedRequest } from './authenticated-request';

/**
 * A ceiling on questions to the assistant, per verified user.
 *
 * The general write ceiling (`WriteThrottleGuard`, 600 an hour) is sized for database rows.
 * A question is different: it is a call billed to the company's own provider account and it
 * holds a function open for seconds. Sixty an hour is a lot of honest questions and very
 * few for a script burning someone's credits.
 */
@Injectable()
export class AssistantThrottleGuard implements CanActivate {
  private memoryLimiter: RateLimiter | null = null;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // The auth middleware already rejected anonymous calls; memory mode has no identity.
    const who = req.auth?.userId ?? 'memory';

    const decision = await this.limiter().hit(
      `assistant:${who}`,
      loadEnv().ASSISTANT_CHATS_PER_HOUR,
      RATE_LIMITS.assistantChat.windowSeconds,
    );

    if (decision.allowed) return true;
    throw domainError('TooManyAttempts', { retryAfter: decision.retryAfterSeconds });
  }

  private limiter(): RateLimiter {
    if (activeDriver() !== 'memory') return postgresRateLimiter(databaseUrl());
    this.memoryLimiter ??= inMemoryRateLimiter();
    return this.memoryLimiter;
  }
}
