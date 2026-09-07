import type { Role, UserId } from '@corebiz/domain';

/**
 * Puertos del modulo de administracion.
 *
 * Viven aparte de `repositories.ts` porque no son repositorios de agregados del
 * dominio: gestionan la PERTENENCIA a la empresa y sus ajustes, que es una capa
 * por encima del negocio. Un cliente o un producto son cosas que la empresa
 * tiene; una membresia es lo que define quien es la empresa.
 *
 * Igual que los demas, ninguna firma recibe `tenantId`: el contexto se inyecta al
 * construir el Unit of Work.
 */

// ─── Invitaciones ────────────────────────────────────────────────────────────

/**
 * Token de invitacion, en sus dos formas.
 *
 * `value` es lo que viaja en el enlace y no se guarda en ningun sitio. `hash` es
 * lo unico que toca la base de datos. La separacion esta en el tipo para que sea
 * imposible confundirlos por descuido: guardar `value` seria guardar una
 * credencial en claro, y quien leyera esa tabla —una copia de seguridad, un
 * volcado de depuracion— entraria en cualquier empresa con invitacion pendiente.
 */
export interface InvitationToken {
  readonly value: string;
  readonly hash: string;
}

/** Genera tokens de invitacion. La criptografia es infraestructura, no dominio. */
export interface TokenFactory {
  next(): InvitationToken;
}

export interface InvitationRecord {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface InvitationRepository {
  /** Invitaciones vivas: ni aceptadas, ni revocadas, ni caducadas. */
  listPending(): Promise<readonly InvitationRecord[]>;
  findPendingByEmail(email: string): Promise<InvitationRecord | null>;
  create(input: {
    id: string;
    email: string;
    role: Role;
    tokenHash: string;
    expiresAt: Date;
    invitedBy: UserId;
  }): Promise<void>;
  /** Devuelve false si no habia nada vivo que revocar. */
  revoke(id: string): Promise<boolean>;
}

// ─── Personas del equipo ─────────────────────────────────────────────────────

export interface MemberRecord {
  readonly userId: string;
  readonly email: string | null;
  readonly role: Role;
  readonly status: string;
  readonly joinedAt: Date;
}

export interface MembershipRepository {
  list(): Promise<readonly MemberRecord[]>;
  findByUserId(userId: UserId): Promise<MemberRecord | null>;
  /**
   * Cambia el rol. Puede fallar por el trigger `enforce_last_owner`, que impide
   * dejar una empresa sin propietario activo; en ese caso lanza, y el caso de uso
   * lo traduce. La regla vive en la base de datos porque tiene que sostenerse
   * aunque la escritura entre por otro camino.
   */
  changeRole(userId: UserId, role: Role): Promise<void>;
  remove(userId: UserId): Promise<void>;
}

// ─── Ajustes de la empresa ───────────────────────────────────────────────────

export interface TenantSettingsUpdate {
  readonly name?: string;
  readonly taxLabel?: string;
  readonly taxRateBp?: number;
  readonly baseCurrency?: 'USD' | 'VES';
  /** Tasa escalada x10^8, ya validada por el dominio. */
  readonly exchangeRateScaled?: bigint;
  readonly exchangeRateAt?: Date;
}

export interface TenantSettingsRepository {
  update(patch: TenantSettingsUpdate): Promise<void>;
}
