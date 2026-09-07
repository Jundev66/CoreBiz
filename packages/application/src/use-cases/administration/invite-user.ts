import { ok, err, can, type Result, type Role, type QuotaError } from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';
import type { TokenFactory } from '../../ports/administration';

/**
 * Caso de uso: invitar a alguien al equipo.
 *
 * Lo interesante de este caso de uso no es invitar: es DONDE se consume la plaza
 * del plan. Se consume al invitar, no al aceptar.
 *
 * La alternativa —cobrar la plaza cuando la persona acepta— parece mas justa y
 * es peor. Con el plan gratuito en dos usuarios, un propietario podria mandar
 * diez invitaciones y las diez serian validas; la novena persona en aceptar se
 * encontraria rechazada por un limite del que nadie le hablo, dos dias despues,
 * sin nada que pudiera hacer al respecto. Reservar la plaza al invitar mueve ese
 * "no" al unico momento en el que alguien puede reaccionar: cuando lo esta
 * pidiendo.
 *
 * El precio de esa decision es que una invitacion olvidada retiene una plaza. Se
 * paga con `app.release_expired_invitations()`, que las libera al caducar.
 */

/** Una semana. Suficiente para unas vacaciones cortas, poco para olvidarse. */
const INVITATION_TTL_DAYS = 7;

export interface InviteUserInput {
  readonly email: string;
  readonly role: Role;
}

export type InviteUserError =
  | { kind: 'Forbidden' }
  | { kind: 'CannotInviteOwner' }
  | { kind: 'InvalidEmail'; raw: string }
  | { kind: 'AlreadyMember'; email: string }
  | { kind: 'AlreadyInvited'; email: string }
  | QuotaError;

export interface InviteUserOutput {
  readonly id: string;
  readonly email: string;
  /**
   * El token EN CLARO, y la unica vez que existe fuera del enlace.
   *
   * Se devuelve para que la interfaz pueda componer la URL de aceptacion y
   * mostrarla o enviarla por correo. No se guarda, no se registra en la
   * auditoria y no se vuelve a poder consultar: si se pierde, se revoca la
   * invitacion y se manda otra.
   */
  readonly token: string;
  readonly expiresAt: Date;
}

export interface InviteUserDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly tokens: TokenFactory;
}

/** Suficiente para descartar lo que no es una direccion. La verdad la dice el buzon. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function makeInviteUser(deps: InviteUserDeps) {
  return async function inviteUser(
    input: InviteUserInput,
  ): Promise<Result<InviteUserOutput, InviteUserError>> {
    if (!can(deps.ctx.actor, 'user:invite')) {
      return err({ kind: 'Forbidden' });
    }

    // La propiedad de una empresa se transfiere entre personas que ya estan
    // dentro; no se reparte por correo a alguien que todavia no ha entrado.
    if (input.role === 'owner') {
      return err({ kind: 'CannotInviteOwner' });
    }

    const email = input.email.trim().toLowerCase();
    if (!EMAIL.test(email)) {
      return err({ kind: 'InvalidEmail', raw: input.email });
    }

    return deps.uow.run(async (repos) => {
      // ORDEN DELIBERADO, y distinto del resto de casos de uso: aqui la
      // duplicidad se comprueba ANTES que la cuota.
      //
      // En el alta de un cliente da igual, porque los dos errores llevan al
      // mismo sitio. Aqui no: con las plazas agotadas, reinvitar a alguien que
      // YA esta invitado responderia "no te quedan plazas", y quien lo lea se
      // pondra a quitar a gente del equipo para arreglar algo que no es un
      // problema de plazas. El mensaje correcto es "ya la invitaste".
      const members = await repos.members.list();
      if (members.some((m) => m.email?.toLowerCase() === email)) {
        return err({ kind: 'AlreadyMember', email });
      }

      const pending = await repos.invitations.findPendingByEmail(email);
      if (pending !== null) {
        return err({ kind: 'AlreadyInvited', email });
      }

      const used = await repos.usage.current('users');
      const quota = deps.ctx.plan.checkQuota('users', used);
      if (!quota.ok) return quota;

      const token = deps.tokens.next();
      const id = deps.ids.next();
      const expiresAt = new Date(
        deps.clock.now().getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
      );

      await repos.invitations.create({
        id,
        email,
        role: input.role,
        // Solo el hash cruza esta frontera. El valor en claro se va con la
        // respuesta y no vuelve a aparecer en ningun sitio.
        tokenHash: token.hash,
        expiresAt,
        invitedBy: deps.ctx.actor.userId,
      });

      await repos.usage.increment('users');

      await repos.audit.record({
        action: 'user.invited',
        entityType: 'invitation',
        entityId: id,
        // El correo y el rol si; el token JAMAS. Un registro de auditoria se
        // consulta y se exporta, y ahi dentro seria una credencial suelta.
        summary: { email, role: input.role },
      });

      return ok({ id, email, token: token.value, expiresAt });
    });
  };
}
