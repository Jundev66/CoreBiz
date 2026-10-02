import { Controller, Delete, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { destroyDemoSandbox } from '@corebiz/infrastructure';
import type { Membership } from '@corebiz/infrastructure';
import { ACTIVE_CONTEXT, IDENTITY, MEMBERSHIPS } from '../../tokens';
import type { ResolvedContext } from '../../composition/context.provider';
import type { VerifiedIdentity } from '../../auth/authenticated-request';
import { databaseUrl } from '../../config/driver';
import { domainError } from '../../http/api-error';
import { bigintToString, dateToIso } from '../../http/serialize';
import { type SessionDto } from './session.dto';

/**
 * Quien soy, donde estoy y con que limites.
 *
 * It is the one call every screen makes, so it returns at once what used to be `ctx` and
 * `session` from `forRequest()`. Without it, each page would ask for the active company,
 * the company list and the plan separately: three trips to the API to paint the header.
 */
@ApiTags('sesion')
@ApiBearerAuth()
@Controller('v1/session')
export class SessionController {
  constructor(
    @Inject(IDENTITY) private readonly identity: VerifiedIdentity,
    @Inject(MEMBERSHIPS) private readonly memberships: readonly Membership[],
    @Inject(ACTIVE_CONTEXT) private readonly resolved: ResolvedContext | null,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Identidad, empresas y limites de quien llama' })
  get(): SessionDto {
    const memberships = this.memberships.map((m) => ({
      tenantId: m.tenantId,
      slug: m.slug,
      name: m.name,
      role: m.role,
      planCode: m.planCode,
      isDemo: m.isDemo,
    }));

    if (this.resolved === null) {
      return {
        email: this.identity.email,
        memberships,
        tenant: null,
        actor: null,
        planCode: null,
        memoryDriver: false,
      };
    }

    const { ctx, session } = this.resolved;

    return {
      email: session.email,
      memberships,
      tenant: {
        id: ctx.tenantId,
        slug: ctx.tenantSlug,
        isDemo: ctx.isDemo,
        expiresAt: dateToIso(session.expiresAt),
        settings: {
          taxLabel: ctx.settings.taxLabel,
          taxRateBp: ctx.settings.taxRateBp,
          baseCurrency: ctx.settings.baseCurrency,
          exchangeRateScaled: bigintToString(ctx.settings.exchangeRateScaled),
          exchangeRateAt: dateToIso(ctx.settings.exchangeRateAt),
        },
      },
      actor: { userId: ctx.actor.userId, role: ctx.actor.role },
      planCode: ctx.plan.code,
      memoryDriver: session.memoryDriver,
    };
  }

  @Delete('demo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Auto-destrucción inmediata de los datos y sandbox de demostración' })
  async destroyDemo(): Promise<{ destroyed: boolean }> {
    if (this.resolved === null || !this.resolved.ctx.isDemo) {
      throw domainError('Forbidden');
    }

    const tenantId = this.resolved.ctx.tenantId;
    const userId = this.identity.userId;
    const destroyed = await destroyDemoSandbox(databaseUrl(), tenantId, userId);

    return { destroyed };
  }
}
