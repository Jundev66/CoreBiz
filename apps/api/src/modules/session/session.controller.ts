import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Membership } from '@corebiz/infrastructure';
import { ACTIVE_CONTEXT, IDENTITY, MEMBERSHIPS } from '../../tokens';
import type { ResolvedContext } from '../../composition/context.provider';
import type { VerifiedIdentity } from '../../auth/authenticated-request';
import { bigintToString, dateToIso } from '../../http/serialize';
import { SessionDto } from './session.dto';

/**
 * Quien soy, donde estoy y con que limites.
 *
 * Es la unica llamada que hace toda pantalla, asi que devuelve de una vez lo que antes
 * eran `ctx` y `session` de `forRequest()`. Sin esto, cada pagina tendria que pedir la
 * empresa activa, la lista de empresas y el plan por separado: tres viajes a Render
 * para pintar la cabecera.
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
}
