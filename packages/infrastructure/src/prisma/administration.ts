import type { Role, TenantId, UserId } from '@corebiz/domain';
import type {
  InvitationRecord,
  InvitationRepository,
  MemberRecord,
  MembershipRepository,
  TenantSettingsRepository,
  TenantSettingsUpdate,
} from '@corebiz/application';
import type { Prisma } from '@corebiz/prisma-client';
import { isRowKey } from './record-id';
import type { Tx } from './session';

/**
 * Adaptadores de administracion.
 *
 * Todos filtran por `tenantId` de forma explicita ademas de estar sometidos a las
 * politicas RLS. Es defensa en profundidad deliberada: si un dia alguien ejecutase una de
 * estas consultas con un rol que se salta las politicas —una migracion, un script de
 * mantenimiento— el filtro seguiria ahi.
 */

function toRole(value: string): Role {
  // La restriccion CHECK de la tabla ya impide cualquier otro valor. Si llegara uno,
  // degradar a `viewer` es lo unico seguro: en la duda, el minimo permiso.
  return (['owner', 'admin', 'sales', 'warehouse', 'viewer'] as const).includes(value as Role)
    ? (value as Role)
    : 'viewer';
}

export class PrismaInvitationRepository implements InvitationRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  /** Ni aceptada, ni revocada, ni caducada. */
  private vivas() {
    return {
      tenant_id: this.tenantId,
      accepted_at: null,
      revoked_at: null,
      expires_at: { gt: new Date() },
    };
  }

  private toRecord(row: Prisma.invitationsGetPayload<object>): InvitationRecord {
    return {
      id: row.id,
      email: row.email,
      role: toRole(row.role),
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      acceptedAt: row.accepted_at,
      revokedAt: row.revoked_at,
    };
  }

  async listPending(): Promise<readonly InvitationRecord[]> {
    const rows = await this.tx.invitations.findMany({
      where: this.vivas(),
      orderBy: { created_at: 'desc' },
    });

    return rows.map((row) => this.toRecord(row));
  }

  async findPendingByEmail(email: string): Promise<InvitationRecord | null> {
    const row = await this.tx.invitations.findFirst({
      where: { ...this.vivas(), email: email.trim().toLowerCase() },
    });
    return row === null ? null : this.toRecord(row);
  }

  async create(input: {
    id: string;
    email: string;
    role: Role;
    tokenHash: string;
    expiresAt: Date;
    invitedBy: UserId;
  }): Promise<void> {
    await this.tx.invitations.create({
      data: {
        id: input.id,
        tenant_id: this.tenantId,
        email: input.email.trim().toLowerCase(),
        role: input.role,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
        invited_by: input.invitedBy,
      },
    });
  }

  async revoke(id: string): Promise<boolean> {
    // An impossible id has nothing to revoke: see `record-id.ts`.
    if (!isRowKey(id)) return false;

    // `updateMany` y contar lo afectado, en lugar de comprobar antes con una lectura: una
    // sola sentencia dice si habia algo vivo que revocar, sin dejar hueco para que otra
    // transaccion lo revoque en medio.
    const { count } = await this.tx.invitations.updateMany({
      where: {
        id,
        tenant_id: this.tenantId,
        accepted_at: null,
        revoked_at: null,
      },
      data: { revoked_at: new Date() },
    });

    return count > 0;
  }
}

export class PrismaMembershipRepository implements MembershipRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  /**
   * El correo vive en `auth.users`, y el rol `authenticated` NO puede leer esa tabla — ni
   * debe. Concederselo daria a cualquier usuario del proyecto el correo y el hash de
   * contrasena de todos los demas, incluidos los de otras empresas.
   *
   * Por eso se pasa por `app.tenant_members()`, una funcion SECURITY DEFINER que resuelve
   * la empresa con `app.current_tenant()` y no acepta ningun parametro: no hay forma de
   * preguntarle por el equipo de otro.
   */
  async list(): Promise<readonly MemberRecord[]> {
    const rows = await this.tx.$queryRaw<
      {
        user_id: string;
        email: string | null;
        role: string;
        status: string;
        created_at: string | Date;
      }[]
    >`select * from app.tenant_members()`;

    return rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      role: toRole(row.role),
      status: row.status,
      joinedAt: new Date(row.created_at),
    }));
  }

  async findByUserId(userId: UserId): Promise<MemberRecord | null> {
    if (!isRowKey(userId)) return null;

    const row = await this.tx.memberships.findFirst({
      where: { tenant_id: this.tenantId, user_id: userId },
    });
    if (row === null) return null;

    return {
      userId: row.user_id,
      email: null,
      role: toRole(row.role),
      status: row.status,
      joinedAt: row.created_at,
    };
  }

  /**
   * Puede lanzar por el trigger `enforce_last_owner`.
   *
   * No se atrapa aqui: el adaptador no sabe que significa esa regla de negocio. La traduce
   * el caso de uso, que es quien tiene que decidir si eso es un error del usuario o un
   * fallo del sistema.
   */
  async changeRole(userId: UserId, role: Role): Promise<void> {
    await this.tx.memberships.updateMany({
      where: { tenant_id: this.tenantId, user_id: userId },
      data: { role },
    });
  }

  async remove(userId: UserId): Promise<void> {
    await this.tx.memberships.deleteMany({
      where: { tenant_id: this.tenantId, user_id: userId },
    });
  }
}

export class PrismaTenantSettingsRepository implements TenantSettingsRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async update(patch: TenantSettingsUpdate): Promise<void> {
    // Solo se escriben los campos presentes. Escribir el objeto entero pondria a null lo
    // que el formulario no envio, que en unos ajustes es la diferencia entre cambiar la
    // tasa y borrar la moneda base.
    //
    // Aqui `undefined` juega a favor por una vez: Prisma OMITE los campos indefinidos, asi
    // que construir el objeto con todos ellos y dejar sin definir los ausentes daria el
    // mismo resultado. Se sigue haciendo explicito porque el proposito se lee mejor, y
    // porque hace falta saber si queda algo que escribir.
    const values: Prisma.tenantsUncheckedUpdateInput = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.taxLabel !== undefined) values.tax_label = patch.taxLabel;
    if (patch.taxRateBp !== undefined) values.tax_rate_bp = patch.taxRateBp;
    if (patch.baseCurrency !== undefined) values.base_currency = patch.baseCurrency;
    if (patch.exchangeRateScaled !== undefined) {
      values.exchange_rate_scaled = patch.exchangeRateScaled;
    }
    if (patch.exchangeRateAt !== undefined) values.exchange_rate_at = patch.exchangeRateAt;

    if (Object.keys(values).length === 0) return;

    await this.tx.tenants.update({ where: { id: this.tenantId }, data: values });
  }
}
