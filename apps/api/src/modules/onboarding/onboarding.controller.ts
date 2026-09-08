import { Body, Controller, Get, Inject, NotFoundException, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
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

const createTenantSchema = z
  .object({
    name: z.string().trim().min(2, 'TooShort').max(120, 'TooLong'),
    baseCurrency: z.enum(['USD', 'VES']).optional(),
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
    const result = await provisionTenant(databaseUrl(), this.identity.userId, {
      name: body.name,
      ...(body.baseCurrency !== undefined ? { baseCurrency: body.baseCurrency } : {}),
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
   */
  @Get('invitations/preview')
  @ApiOperation({ summary: 'Previsualizar una invitacion sin aceptarla' })
  async preview(
    @Query(new ZodValidationPipe(tokenSchema)) query: z.infer<typeof tokenSchema>,
  ): Promise<InvitationPreview> {
    const preview = await previewInvitation(databaseUrl(), this.identity.userId, query.token);
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
