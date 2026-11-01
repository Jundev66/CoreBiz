import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { z } from 'zod';
import { inMemoryRateLimiter, type RateLimitDecision } from '@corebiz/application';
import { postgresRateLimiter } from '@corebiz/infrastructure';
import { InternalSecretGuard } from '../../../auth/internal-secret.guard';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { activeDriver, databaseUrl } from '../../../config/driver';

const rateLimitSchema = z
  .object({
    bucket: z.string().trim().min(1).max(160),
    limit: z.number().int().min(1).max(10_000),
    windowSeconds: z.number().int().min(1).max(86_400),
  })
  .strict();

@ApiExcludeController()
@UseGuards(InternalSecretGuard)
@Controller('internal')
export class HitRateLimitController {
  @Post('rate-limits')
  run(
    @Body(new ZodValidationPipe(rateLimitSchema)) body: z.infer<typeof rateLimitSchema>,
  ): Promise<RateLimitDecision> {
    const limiter =
      activeDriver() === 'memory' ? inMemoryRateLimiter() : postgresRateLimiter(databaseUrl());

    return limiter.hit(body.bucket, body.limit, body.windowSeconds);
  }
}
