import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import {
  changeMemberRoleSchema,
  inviteUserSchema,
  updateTenantSettingsSchema,
} from '@corebiz/contracts';
import { isRole } from '@corebiz/domain';
import type {
  AuditEntryView,
  PendingInvitationView,
  Page,
  TeamMemberView,
} from '@corebiz/application';
import { FeatureGuard } from '../../auth/feature.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequireFeature } from '../../auth/require-feature.decorator';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { domainError, unwrapOrThrow } from '../../http/api-error';
import {
  auditExportQuerySchema,
  auditQuerySchema,
  withoutUndefined,
} from '../../http/list-queries';
import { bigintToString } from '../../http/serialize';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { RUNTIME, TENANT_CONTEXT, USE_CASES } from '../../tokens';
import type { TenantContext } from '@corebiz/application';
import type { Runtime } from '../../composition/runtime.provider';
import type { UseCases } from '../../composition/use-cases.provider';

@ApiTags('administracion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@Controller('v1/administration')
export class AdministrationController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(RUNTIME) private readonly runtime: Runtime,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get('team')
  @RequirePermission('user:read')
  @ApiOperation({ summary: 'Quien tiene acceso a la empresa' })
  team(): Promise<readonly TeamMemberView[]> {
    return this.runtime.queries.admin.team();
  }

  @Get('invitations')
  @RequirePermission('user:read')
  @ApiOperation({ summary: 'Invitaciones enviadas y todavia sin aceptar' })
  invitations(): Promise<readonly PendingInvitationView[]> {
    return this.runtime.queries.admin.pendingInvitations();
  }

  /**
   * Invitar a alguien.
   *
   * Devuelve el token EN CLARO, y es la unica vez que existe fuera del enlace: en la
   * base solo se guarda su SHA-256 (ADR 007). No se compone la URL aqui porque el
   * dominio publico es de la interfaz, no de la API — y una API que fabrica enlaces a
   * un dominio que lee de una variable de entorno acaba mandando enlaces a localhost.
   */
  @Post('invitations')
  @RequirePermission('user:invite')
  @ApiOperation({ summary: 'Invitar a alguien a la empresa' })
  async invite(
    @Body(new ZodValidationPipe(inviteUserSchema)) body: z.infer<typeof inviteUserSchema>,
  ): Promise<unknown> {
    /*
     * El rol se valida contra la lista del DOMINIO, no contra una copia escrita en el
     * esquema. `inviteUser` recibe un `Role` ya tipado y no devuelve ningun error para
     * un rol inexistente, asi que si no se comprueba aqui una cadena cualquiera
     * llegaria hasta la base de datos y la rechazaria una restriccion, con un 500 en
     * lugar de un mensaje util.
     */
    if (!isRole(body.role)) {
      throw domainError('UnknownRole', { raw: body.role });
    }

    return unwrapOrThrow(await this.useCases.inviteUser({ email: body.email, role: body.role }));
  }

  @Delete('invitations/:id')
  @RequirePermission('user:manage')
  @ApiOperation({ summary: 'Revocar una invitacion sin aceptar' })
  async revokeInvitation(@Param('id') id: string): Promise<{ id: string }> {
    return unwrapOrThrow(await this.useCases.revokeInvitation(id));
  }

  @Patch('members/:userId')
  @RequirePermission('user:manage')
  @ApiOperation({ summary: 'Cambiar el rol de un miembro' })
  async changeRole(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(changeMemberRoleSchema))
    body: z.infer<typeof changeMemberRoleSchema>,
  ): Promise<unknown> {
    return unwrapOrThrow(await this.useCases.changeMemberRole({ userId, role: body.role }));
  }

  @Delete('members/:userId')
  @RequirePermission('user:manage')
  @ApiOperation({ summary: 'Quitar el acceso de alguien a la empresa' })
  async removeMember(@Param('userId') userId: string): Promise<{ userId: string }> {
    return unwrapOrThrow(await this.useCases.removeMember(userId));
  }

  @Patch('settings')
  @RequirePermission('settings:write')
  @ApiOperation({ summary: 'Ajustes de la empresa' })
  async updateSettings(
    @Body(new ZodValidationPipe(updateTenantSettingsSchema))
    body: z.infer<typeof updateTenantSettingsSchema>,
  ): Promise<Record<string, string | number>> {
    const saved = unwrapOrThrow(await this.useCases.updateTenantSettings(withoutUndefined(body)));

    /*
     * La tasa vuelve como `bigint`, y `JSON.stringify` LANZA sobre un bigint — no lo
     * omite, revienta. Devolver el parche tal cual daba un 500 DESPUES de haber
     * guardado: la pantalla decia que habia fallado una operacion que si se hizo, y el
     * usuario volvia a intentarlo.
     *
     * Es exactamente el fallo que advierte `http/serialize.ts`. Estaba resuelto en la
     * sesion y suelto aqui, que es el unico otro sitio donde un bigint cruza el cable.
     */
    return {
      ...(saved.name !== undefined ? { name: saved.name } : {}),
      ...(saved.taxLabel !== undefined ? { taxLabel: saved.taxLabel } : {}),
      ...(saved.taxRateBp !== undefined ? { taxRateBp: saved.taxRateBp } : {}),
      ...(saved.baseCurrency !== undefined ? { baseCurrency: saved.baseCurrency } : {}),
      ...(saved.exchangeRateScaled !== undefined && saved.exchangeRateScaled !== null
        ? { exchangeRateScaled: bigintToString(saved.exchangeRateScaled) ?? '' }
        : {}),
    };
  }

  /**
   * El registro de auditoria.
   *
   * Lo protege la politica RLS —solo propietario y administrador— y no un `if` de la
   * pantalla. Que la auditoria diga quien hizo que la convierte en un panel de
   * vigilancia entre companeros si la lee cualquiera con permiso de escritura.
   */
  @Get('audit')
  @RequirePermission('audit:read')
  @ApiOperation({ summary: 'Registro de auditoria, del mas reciente al mas antiguo' })
  audit(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: z.infer<typeof auditQuerySchema>,
  ): Promise<Page<AuditEntryView>> {
    return this.runtime.queries.admin.auditLog(withoutUndefined(query));
  }

  @Get('audit/actions')
  @RequirePermission('audit:read')
  @ApiOperation({ summary: 'Acciones distintas presentes en el registro, para el filtro' })
  auditActions(): Promise<readonly string[]> {
    return this.runtime.queries.admin.auditActions();
  }

  /**
   * El registro completo, como CSV.
   *
   * El archivo se genera AQUI y no en la interfaz, aunque antes se generase alli. El
   * motivo es que `audit_export` es una funcionalidad de PLAN, y con la generacion en
   * la web bastaba con pedir `GET /v1/administration/audit?limit=5000` para tener los
   * mismos datos y armar el CSV a mano. El gate tiene que estar donde se produce el
   * archivo, y el archivo se produce donde estan los datos.
   *
   * La pantalla paginada sigue abierta al plan gratuito: lo que se vende no es ver el
   * registro, es llevarselo entero de una vez.
   */
  @Get('audit/export')
  @RequirePermission('audit:export')
  @RequireFeature('audit_export')
  @ApiOperation({ summary: 'El registro de auditoria completo, en CSV' })
  async auditExport(
    @Query(new ZodValidationPipe(auditExportQuerySchema))
    query: z.infer<typeof auditExportQuerySchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const page = await this.runtime.queries.admin.auditLog({
      ...withoutUndefined({ action: query.action, from: query.from, to: query.to }),
      // Un tope alto pero acotado: sin limite, exportar el historico entero de un
      // tenant grande lo trae todo a memoria de golpe.
      limit: 5_000,
    });

    const rows = page.items.map((entry) => [
      entry.occurredAt.toISOString(),
      entry.actorEmail ?? '',
      entry.action,
      entry.entityType ?? '',
      entry.entityId ?? '',
      entry.summary === null ? '' : JSON.stringify(entry.summary),
    ]);

    const header = ['fecha', 'actor', 'accion', 'entidad', 'identificador', 'detalle'];
    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="auditoria-${this.ctx.tenantSlug}-${stamp}.csv"`,
    );
    // Un export de auditoria no se cachea en ningun sitio: lleva quien hizo que y
    // cuando, y ademas cambia cada vez.
    res.setHeader('Cache-Control', 'no-store');

    // CRLF y no LF: es lo que espera Excel al abrir un CSV en Windows, que es donde
    // se va a abrir esto.
    return [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  }
}

/**
 * Escapa un campo CSV.
 *
 * El prefijo con comilla simple ante `= + - @` no es paranoia: Excel y Calc interpretan
 * un campo que empieza por esos caracteres como una FORMULA, y un `=HYPERLINK(...)`
 * guardado en un campo de auditoria se ejecuta al abrir el archivo. Se llama inyeccion
 * de formulas CSV y es un vector real en cualquier exportacion que incluya texto
 * escrito por usuarios.
 */
function escapeCsv(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replaceAll('"', '""')}"`;
}
