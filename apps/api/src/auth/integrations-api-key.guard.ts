import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { inMemoryRateLimiter, type RateLimiter } from '@corebiz/application';
import { loadEnv } from '../config/env';

@Injectable()
export class IntegrationsApiKeyGuard implements CanActivate {
  private readonly failedLimiter: RateLimiter = inMemoryRateLimiter();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const expected = loadEnv().INTEGRATIONS_API_KEY;
    if (expected === undefined) throw new NotFoundException();

    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization ?? '';
    const xApiKeyHeader = (req.headers['x-api-key'] as string | undefined) ?? '';
    const given = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : xApiKeyHeader;

    if (!given || !constantTimeEquals(given, expected)) {
      const clientIp = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
      const decision = await this.failedLimiter.hit(`badApiKey:${clientIp}`, 30, 60);
      if (!decision.allowed) {
        throw new HttpException(
          { errorKind: 'TooManyAttempts', errorParams: { retryAfter: decision.retryAfterSeconds } },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw unauthorized();
    }

    return true;
  }
}

function unauthorized(): UnauthorizedException {
  return new UnauthorizedException({ errorKind: 'Unauthenticated', errorParams: {} });
}

function constantTimeEquals(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
