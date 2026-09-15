import { Body, Controller, HttpCode, Inject, NotFoundException, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ExchangeRate } from '@corebiz/domain';
import {
  acceptInvitation,
  previewInvitation,
  provisionTenant,
  type InvitationPreview,
} from '@corebiz/infrastructure';
import { domainError } from '../../http/api-error';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { IDENTITY } from '../../tokens';
import type { VerifiedIdentity } from '../../auth/authenticated-request';
import { databaseUrl } from '../../config/driver';
import { loadEnv } from '../../config/env';

/**
 * Los datos con los que nace una empresa.
 *
 * Antes solo se pedia el nombre y la moneda. Faltaba la TASA, y su ausencia no era un
 * detalle: `exchange_rate_scaled` quedaba en NULL y con eso no se emite una sola nota
 * de entrega —el caso de uso lo comprueba antes de abrir la transaccion—. La empresa
 * nacia rota y solo se arreglaba si alguien encontraba Ajustes.
 *
 * La tasa se acepta como TEXTO decimal y la convierte el mismo value object que usa el
 * ajuste de la empresa. Asi lo que se admite al crearla es exactamente lo que sabra
 * usar el primer documento.
 */
const createTenantSchema = z
  .object({
    name: z.string().trim().min(2, 'TooShort').max(120, 'TooLong'),
    baseCurrency: z.enum(['USD', 'VES']).optional(),
    taxLabel: z.string().trim().min(2, 'TooShort').max(60, 'TooLong').optional(),
    taxRateBp: z.coerce.number().int().min(0).max(10_000).optional(),
    exchangeRate: z.string().trim().max(32).optional().or(z.literal('')),
  })
  .strict();

const tokenSchema = z.object({ token: z.string().trim().min(1, 'Required').max(200) }).strict();

/**
 * Alta de empresa y aceptacion de invitaciones.
 *
 * Es el unico modulo que trabaja SIN un tenant activo, y por eso inyecta la identidad
 * en lugar del contexto: quien llega aqui acaba de crear su cuenta y todavia no
 * pertenece a ninguna empresa, o pertenece a otras pero esta entrando en una nueva.
 * Pedir `TENANT_CONTEXT` lo dejaria fuera con un 409 justo en el unico momento en que
 * ese estado es normal.
 *
 * Ninguna de estas operaciones usa una clave privilegiada. Todas entran por funciones
 * `SECURITY DEFINER` acotadas que resuelven la identidad con `auth.uid()`, asi que el
 * usuario no puede pedir que se le provisione una empresa "para otro" (ADR 005).
 */
@ApiTags('alta')
@ApiBearerAuth()
@Controller('v1')
export class OnboardingController {
  constructor(@Inject(IDENTITY) private readonly identity: VerifiedIdentity) {}

  @Post('onboarding/tenants')
  @ApiOperation({ summary: 'Crear la empresa de quien acaba de registrarse' })
  async createTenant(
    @Body(new ZodValidationPipe(createTenantSchema)) body: z.infer<typeof createTenantSchema>,
  ): Promise<{ tenantId: string }> {
    // Con el alta cerrada el endpoint NO EXISTE, en lugar de existir y negarse. Es la
    // misma regla que /demo: una puerta que contesta "cerrado" sigue siendo una puerta
    // que se puede probar. Aceptar invitaciones no se toca — quien fue invitado a una
    // empresa que ya existe tiene que poder entrar.
    if (!loadEnv().SIGNUP_ENABLED) throw new NotFoundException();

    const baseCurrency = body.baseCurrency ?? 'USD';

    let exchangeRateScaled: bigint | undefined;
    if (body.exchangeRate !== undefined && body.exchangeRate.trim() !== '') {
      // El value object valida y escala, igual que en Ajustes. Una expresion regular
      // aqui aceptaria formas que el documento luego no sabria usar.
      const parsed = ExchangeRate.of(
        body.exchangeRate,
        baseCurrency,
        baseCurrency === 'USD' ? 'VES' : 'USD',
        new Date(),
      );
      if (!parsed.ok) throw domainError('INVALID_EXCHANGE_RATE');
      exchangeRateScaled = parsed.value.scaledRate;
    }

    const result = await provisionTenant(databaseUrl(), this.identity.userId, {
      name: body.name,
      baseCurrency,
      ...(body.taxLabel !== undefined ? { taxLabel: body.taxLabel } : {}),
      ...(body.taxRateBp !== undefined ? { taxRateBp: body.taxRateBp } : {}),
      ...(exchangeRateScaled !== undefined ? { exchangeRateScaled } : {}),
    });

    if (!result.ok || result.tenantId === undefined) {
      throw domainError(result.error ?? 'UNKNOWN');
    }
    return { tenantId: result.tenantId };
  }

  /**
   * Lo que se le puede contar a alguien antes de que acepte.
   *
   * Un token invalido, caducado, revocado o ya usado dan el MISMO 404, a proposito:
   * con un token valido en la mano ya se sabe todo esto, y con uno invalido no se
   * aprende nada.
   *
   * POST even though it changes nothing, because the token is a live credential for seven
   * days. In a query string it landed in the platform request logs of both Vercel projects,
   * which our own log filter does not reach. In a body it does not. 200, not 201: nothing
   * is created.
   */
  @Post('invitations/preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Previsualizar una invitacion sin aceptarla' })
  async preview(
    @Body(new ZodValidationPipe(tokenSchema)) body: z.infer<typeof tokenSchema>,
  ): Promise<InvitationPreview> {
    const preview = await previewInvitation(databaseUrl(), this.identity.userId, body.token);
    if (preview === null)
      throw new NotFoundException({ errorKind: 'InvitationNotFound', errorParams: {} });
    return preview;
  }

  @Post('invitations/accept')
  @ApiOperation({ summary: 'Aceptar una invitacion y entrar en la empresa' })
  async accept(
    @Body(new ZodValidationPipe(tokenSchema)) body: z.infer<typeof tokenSchema>,
  ): Promise<{ tenantId: string }> {
    const result = await acceptInvitation(databaseUrl(), this.identity.userId, body.token);
    if (!result.ok) throw domainError(result.error);
    return { tenantId: result.tenantId };
  }
}
