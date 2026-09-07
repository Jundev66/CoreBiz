import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { schema } from '@corebiz/db';
import type { Role, TenantId, UserId } from '@corebiz/domain';
import type {
  InvitationRecord,
  InvitationRepository,
  MemberRecord,
  MembershipRepository,
  TenantSettingsRepository,
  TenantSettingsUpdate,
} from '@corebiz/application';
import type { Tx } from './tx';

const { invitations, memberships, tenants } = schema;

/**
 * Adaptadores de administracion sobre Drizzle.
 *
 * Todos filtran por `tenantId` de forma explicita ademas de estar sometidos a
 * las politicas RLS. Es defensa en profundidad deliberada: si un dia alguien
 * ejecutase una de estas consultas con un rol que se salta las politicas —una
 * migracion, un script de mantenimiento— el filtro seguiria ahi.
 */

function toRole(value: string): Role {
  // La restriccion CHECK de la tabla ya impide cualquier otro valor. Si llegara
  // uno, degradar a `viewer` es lo unico seguro: en la duda, el minimo permiso.
  return (['owner', 'admin', 'sales', 'warehouse', 'viewer'] as const).includes(value as Role)
    ? (value as Role)
    : 'viewer';
}

export class DrizzleInvitationRepository implements InvitationRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  /** Ni aceptada, ni revocada, ni caducada. */
  private liveConditions() {
    return and(
      eq(invitations.tenantId, this.tenantId),
      isNull(invitations.acceptedAt),
      isNull(invitations.revokedAt),
      gt(invitations.expiresAt, new Date()),
    );
  }

  private toRecord(row: typeof invitations.$inferSelect): InvitationRecord {
    return {
      id: row.id,
      email: row.email,
      role: toRole(row.role),
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      acceptedAt: row.acceptedAt,
      revokedAt: row.revokedAt,
    };
  }

  async listPending(): Promise<readonly InvitationRecord[]> {
    const rows = await this.tx
      .select()
      .from(invitations)
      .where(this.liveConditions())
      .orderBy(sql`${invitations.createdAt} desc`);

    return rows.map((row) => this.toRecord(row));
  }

  async findPendingByEmail(email: string): Promise<InvitationRecord | null> {
    const rows = await this.tx
      .select()
      .from(invitations)
      .where(and(this.liveConditions(), eq(invitations.email, email.trim().toLowerCase())))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : this.toRecord(row);
  }

  async create(input: {
    id: string;
    email: string;
    role: Role;
    tokenHash: string;
    expiresAt: Date;
    invitedBy: UserId;
  }): Promise<void> {
    await this.tx.insert(invitations).values({
      id: input.id,
      tenantId: this.tenantId,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      invitedBy: input.invitedBy,
    });
  }

  async revoke(id: string): Promise<boolean> {
    // `returning` en lugar de comprobar antes con un select: una sola sentencia
    // dice si habia algo vivo que revocar, sin dejar hueco para que otra
    // transaccion lo revoque en medio.
    const rows = await this.tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.id, id),
          eq(invitations.tenantId, this.tenantId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning({ id: invitations.id });

    return rows.length > 0;
  }
}

export class DrizzleMembershipRepository implements MembershipRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  /**
   * El correo vive en `auth.users`, y el rol `authenticated` NO puede leer esa
   * tabla — ni debe. Concederselo daria a cualquier usuario del proyecto el
   * correo y el hash de contrasena de todos los demas, incluidos los de otras
   * empresas.
   *
   * Por eso se pasa por `app.tenant_members()`, una funcion SECURITY DEFINER que
   * resuelve la empresa con `app.current_tenant()` y no acepta ningun parametro:
   * no hay forma de preguntarle por el equipo de otro.
   */
  async list(): Promise<readonly MemberRecord[]> {
    const rows = await this.tx.execute(sql`select * from app.tenant_members()`);

    return rows.map((raw) => {
      const row = raw as {
        user_id: string;
        email: string | null;
        role: string;
        status: string;
        created_at: string | Date;
      };
      return {
        userId: row.user_id,
        email: row.email,
        role: toRole(row.role),
        status: row.status,
        joinedAt: new Date(row.created_at),
      };
    });
  }

  async findByUserId(userId: UserId): Promise<MemberRecord | null> {
    const rows = await this.tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.tenantId, this.tenantId), eq(memberships.userId, userId)))
      .limit(1);

    const row = rows[0];
    if (row === undefined) return null;

    return {
      userId: row.userId,
      email: null,
      role: toRole(row.role),
      status: row.status,
      joinedAt: row.createdAt,
    };
  }

  /**
   * Puede lanzar por el trigger `enforce_last_owner`.
   *
   * No se atrapa aqui: el adaptador no sabe que significa esa regla de negocio.
   * La traduce el caso de uso, que es quien tiene que decidir si eso es un error
   * del usuario o un fallo del sistema.
   */
  async changeRole(userId: UserId, role: Role): Promise<void> {
    await this.tx
      .update(memberships)
      .set({ role })
      .where(and(eq(memberships.tenantId, this.tenantId), eq(memberships.userId, userId)));
  }

  async remove(userId: UserId): Promise<void> {
    await this.tx
      .delete(memberships)
      .where(and(eq(memberships.tenantId, this.tenantId), eq(memberships.userId, userId)));
  }
}

export class DrizzleTenantSettingsRepository implements TenantSettingsRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async update(patch: TenantSettingsUpdate): Promise<void> {
    // Solo se escriben los campos presentes. Un `set` con todo el objeto pondria
    // a null lo que el formulario no envio, que en unos ajustes es la diferencia
    // entre cambiar la tasa y borrar la moneda base.
    const values: Record<string, unknown> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.taxLabel !== undefined) values.taxLabel = patch.taxLabel;
    if (patch.taxRateBp !== undefined) values.taxRateBp = patch.taxRateBp;
    if (patch.baseCurrency !== undefined) values.baseCurrency = patch.baseCurrency;
    if (patch.exchangeRateScaled !== undefined) {
      values.exchangeRateScaled = patch.exchangeRateScaled;
    }
    if (patch.exchangeRateAt !== undefined) values.exchangeRateAt = patch.exchangeRateAt;

    if (Object.keys(values).length === 0) return;

    await this.tx.update(tenants).set(values).where(eq(tenants.id, this.tenantId));
  }
}
