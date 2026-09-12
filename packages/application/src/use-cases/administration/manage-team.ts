import { ok, err, can, isRole, type Result, type Role, type UserId } from '@corebiz/domain';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

/**
 * Casos de uso que tocan quien esta dentro de la empresa y con que papel.
 *
 * Los tres comparten una decision que conviene ver junta: la regla del ULTIMO
 * PROPIETARIO no se comprueba aqui. Vive en un trigger de la base de datos
 * (`enforce_last_owner`), y este archivo se limita a traducir su excepcion a un
 * error con nombre.
 *
 * Podria comprobarse aqui, con un `count`. Seria mas legible y estaria mal: entre
 * el conteo y la escritura cabe otra transaccion, y dos propietarios que se
 * degradan a la vez dejarian la empresa sin ninguno. Una empresa sin propietario
 * no se puede recuperar por la interfaz — hace falta entrar a la base de datos a
 * mano. Esa clase de invariante pertenece al unico sitio que puede garantizarla.
 */

function isLastOwnerFailure(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current.message.includes('LAST_OWNER')) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

// ─── Cambiar el rol de alguien ───────────────────────────────────────────────

export interface ChangeMemberRoleInput {
  readonly userId: string;
  readonly role: string;
}

export type ChangeMemberRoleError =
  | { kind: 'Forbidden' }
  | { kind: 'UnknownRole'; raw: string }
  | { kind: 'MemberNotFound' }
  | { kind: 'OnlyOwnerGrantsOwnership' }
  | { kind: 'OnlyOwnerManagesOwners' }
  | { kind: 'LastOwner' };

export interface ManageTeamDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
}

export function makeChangeMemberRole(deps: ManageTeamDeps) {
  return async function changeMemberRole(
    input: ChangeMemberRoleInput,
  ): Promise<Result<{ userId: string; role: Role }, ChangeMemberRoleError>> {
    if (!can(deps.ctx.actor, 'user:manage')) {
      return err({ kind: 'Forbidden' });
    }

    if (!isRole(input.role)) {
      return err({ kind: 'UnknownRole', raw: input.role });
    }

    // Se copia a una constante local a proposito: TypeScript descarta el
    // estrechamiento de `input.role` al entrar en el callback de la transaccion,
    // porque no puede saber que nadie muto el objeto por el camino.
    const role: Role = input.role;

    // Un administrador gestiona al equipo pero no reparte la propiedad de la
    // empresa: eso solo lo hace quien ya la tiene.
    if (role === 'owner' && deps.ctx.actor.role !== 'owner') {
      return err({ kind: 'OnlyOwnerGrantsOwnership' });
    }

    return deps.uow.run(async (repos) => {
      const member = await repos.members.findByUserId(input.userId as UserId);
      if (member === null) return err({ kind: 'MemberNotFound' });

      // Only an owner changes or removes an owner. The last-owner trigger only protects the
      // LAST one: without this an admin could demote or remove every co-owner but one.
      if (member.role === 'owner' && deps.ctx.actor.role !== 'owner') {
        return err({ kind: 'OnlyOwnerManagesOwners' });
      }

      // Cambiar el rol al que ya tiene no es un error, pero tampoco es un cambio:
      // registrarlo en la auditoria solo ensuciaria el rastro.
      if (member.role === role) {
        return ok({ userId: input.userId, role });
      }

      try {
        await repos.members.changeRole(input.userId as UserId, role);
      } catch (error) {
        if (isLastOwnerFailure(error)) return err({ kind: 'LastOwner' });
        throw error;
      }

      await repos.audit.record({
        action: 'user.role_changed',
        entityType: 'membership',
        entityId: input.userId,
        diff: { from: member.role, to: role },
      });

      return ok({ userId: input.userId, role });
    });
  };
}

// ─── Sacar a alguien del equipo ──────────────────────────────────────────────

export type RemoveMemberError =
  | { kind: 'Forbidden' }
  | { kind: 'MemberNotFound' }
  | { kind: 'CannotRemoveSelf' }
  | { kind: 'OnlyOwnerManagesOwners' }
  | { kind: 'LastOwner' };

export function makeRemoveMember(deps: ManageTeamDeps) {
  return async function removeMember(
    userId: string,
  ): Promise<Result<{ userId: string }, RemoveMemberError>> {
    if (!can(deps.ctx.actor, 'user:manage')) {
      return err({ kind: 'Forbidden' });
    }

    // Quitarse a uno mismo deja a la persona fuera de una empresa a la que ya no
    // puede volver a entrar por su cuenta. Se bloquea aqui porque es un error
    // facil de cometer con un boton al lado del nombre propio.
    if (userId === deps.ctx.actor.userId) {
      return err({ kind: 'CannotRemoveSelf' });
    }

    return deps.uow.run(async (repos) => {
      const member = await repos.members.findByUserId(userId as UserId);
      if (member === null) return err({ kind: 'MemberNotFound' });

      // Only an owner changes or removes an owner. The last-owner trigger only protects the
      // LAST one: without this an admin could demote or remove every co-owner but one.
      if (member.role === 'owner' && deps.ctx.actor.role !== 'owner') {
        return err({ kind: 'OnlyOwnerManagesOwners' });
      }

      try {
        await repos.members.remove(userId as UserId);
      } catch (error) {
        if (isLastOwnerFailure(error)) return err({ kind: 'LastOwner' });
        throw error;
      }

      // La plaza vuelve al plan. Sin esto, un equipo que rota acabaria bloqueado
      // por gente que ya no esta.
      await repos.usage.decrement('users');

      await repos.audit.record({
        action: 'user.removed',
        entityType: 'membership',
        entityId: userId,
        summary: { role: member.role, email: member.email },
      });

      return ok({ userId });
    });
  };
}

// ─── Revocar una invitacion ──────────────────────────────────────────────────

export type RevokeInvitationError = { kind: 'Forbidden' } | { kind: 'InvitationNotFound' };

export function makeRevokeInvitation(deps: ManageTeamDeps) {
  return async function revokeInvitation(
    invitationId: string,
  ): Promise<Result<{ id: string }, RevokeInvitationError>> {
    if (!can(deps.ctx.actor, 'user:manage')) {
      return err({ kind: 'Forbidden' });
    }

    return deps.uow.run(async (repos) => {
      const revoked = await repos.invitations.revoke(invitationId);
      if (!revoked) return err({ kind: 'InvitationNotFound' });

      // La plaza reservada al invitar se devuelve al plan.
      await repos.usage.decrement('users');

      await repos.audit.record({
        action: 'user.invitation_revoked',
        entityType: 'invitation',
        entityId: invitationId,
      });

      return ok({ id: invitationId });
    });
  };
}
