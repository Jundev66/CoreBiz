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
  UseGuards,
} from '@nestjs/common';
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
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { domainError, unwrapOrThrow } from '../../http/api-error';
import { auditQuerySchema, withoutUndefined } from '../../http/list-queries';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { RUNTIME, USE_CASES } from '../../tokens';
import type { Runtime } from '../../composition/runtime.provider';
import type { UseCases } from '../../composition/use-cases.provider';

@ApiTags('administracion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/administration')
export class AdministrationController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(RUNTIME) private readonly runtime: Runtime,
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
  ): Promise<unknown> {
    return unwrapOrThrow(await this.useCases.updateTenantSettings(withoutUndefined(body)));
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
}
