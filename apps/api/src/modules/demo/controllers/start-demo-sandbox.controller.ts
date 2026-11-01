import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RATE_LIMITS } from '@corebiz/application';
import {
  countRecentDemoSandboxes,
  postgresRateLimiter,
  provisionDemoSandbox,
  recordDemoLead,
} from '@corebiz/infrastructure';
import { InternalSecretGuard } from '../../../auth/internal-secret.guard';
import { loadEnv } from '../../../config/env';
import { activeDriver, databaseUrl } from '../../../config/driver';
import { domainError } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';

const DEMO_TEMPLATE_TENANT_ID = '00000000-0000-4000-8000-000000000001';

const startDemoSchema = z
  .object({
    ipHash: z.string().trim().min(1).max(160).nullable(),
    leadEmail: z.string().trim().email().max(255).optional().nullable(),
    leadName: z.string().trim().max(120).optional().nullable(),
    leadCompany: z.string().trim().max(120).optional().nullable(),
  })
  .strict();

export interface DemoCredentials {
  readonly email: string;
  readonly password: string;
  readonly hoursLeft: number;
  readonly readonly: boolean;
  readonly readonlyReason: 'busy' | 'limit' | null;
}

@ApiTags('demostracion')
@UseGuards(InternalSecretGuard)
@Controller('v1/demo')
export class StartDemoSandboxController {
  @Post('sandboxes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Entregar credenciales propias a un visitante' })
  async run(
    @Body(new ZodValidationPipe(startDemoSchema)) body: z.infer<typeof startDemoSchema>,
  ): Promise<DemoCredentials> {
    const env = loadEnv();

    if (!env.DEMO_ENABLED) throw new NotFoundException();

    if (activeDriver() === 'memory') {
      throw domainError('Unavailable');
    }

    const url = databaseUrl();
    const hour = RATE_LIMITS.demoSandbox.windowSeconds;

    const [fromOrigin, overall] = await Promise.all([
      countRecentDemoSandboxes(url, { ipHash: body.ipHash, sinceSeconds: hour }),
      countRecentDemoSandboxes(url, { sinceSeconds: hour }),
    ]);
    const quotaReached =
      fromOrigin >= env.DEMO_MAX_PER_HOUR || overall >= env.DEMO_MAX_SANDBOXES_PER_HOUR;

    if (quotaReached) {
      const decision = await postgresRateLimiter(url).hit(
        `demoViewer:${body.ipHash ?? 'anonimo'}`,
        RATE_LIMITS.demoViewer.limit,
        RATE_LIMITS.demoViewer.windowSeconds,
      );
      if (!decision.allowed) {
        throw domainError('TooManyAttempts', { retryAfter: decision.retryAfterSeconds ?? 0 });
      }
    }

    const result = await provisionDemoSandbox(url, {
      templateTenantId: DEMO_TEMPLATE_TENANT_ID,
      ipHash: body.ipHash,
      ttlHours: env.DEMO_TTL_HOURS,
      maxConcurrent: env.DEMO_MAX_CONCURRENT,
      maxReadonlyPerHour: env.DEMO_MAX_READONLY_PER_HOUR,
      forceReadonly: quotaReached,
    });

    if (!result.ok) throw domainError('Unavailable');

    if (body.leadEmail) {
      void recordDemoLead(url, {
        email: body.leadEmail,
        name: body.leadName,
        company: body.leadCompany,
        ipHash: body.ipHash,
      });
    }

    return {
      email: result.email,
      password: result.password,
      hoursLeft: env.DEMO_TTL_HOURS,
      readonly: result.readonly,
      readonlyReason:
        result.readonlyReason === 'capacity'
          ? 'busy'
          : result.readonlyReason === 'limit'
            ? 'limit'
            : null,
    };
  }
}
