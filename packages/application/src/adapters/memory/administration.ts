import type { Role, TenantId, UserId } from '@corebiz/domain';
import type {
  InvitationRecord,
  InvitationRepository,
  MemberRecord,
  MembershipRepository,
  TenantSettingsRepository,
  TenantSettingsUpdate,
  TokenFactory,
} from '../../ports/administration';

/**
 * Adaptadores de administracion en memoria.
 *
 * Reproducen del real lo que cambia el resultado de un test, y nada mas:
 *
 *   - El filtrado por tenant, para que un test verde en memoria no oculte una
 *     fuga que el adaptador de Postgres sí tendría.
 *   - El fallo del ULTIMO PROPIETARIO. En produccion lo impone un trigger, no
 *     este codigo, pero si el doble no lo imitara, el caso de uso que traduce esa
 *     excepcion no tendria forma de probarse sin levantar Postgres.
 */

interface StoredInvitation extends InvitationRecord {
  readonly tenantId: TenantId;
  readonly tokenHash: string;
}

interface StoredMember extends MemberRecord {
  readonly tenantId: TenantId;
}

export interface AdminStores {
  readonly invitations: Map<string, StoredInvitation>;
  readonly members: Map<string, StoredMember>;
  readonly tenantSettings: Map<string, TenantSettingsUpdate>;
}

export function createAdminStores(): AdminStores {
  return { invitations: new Map(), members: new Map(), tenantSettings: new Map() };
}

export class InMemoryInvitationRepository implements InvitationRepository {
  constructor(
    private readonly store: Map<string, StoredInvitation>,
    private readonly tenantId: TenantId,
    private readonly now: () => Date,
  ) {}

  private live(): StoredInvitation[] {
    return [...this.store.values()].filter(
      (i) =>
        i.tenantId === this.tenantId &&
        i.acceptedAt === null &&
        i.revokedAt === null &&
        i.expiresAt > this.now(),
    );
  }

  listPending(): Promise<readonly InvitationRecord[]> {
    return Promise.resolve(
      this.live().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    );
  }

  findPendingByEmail(email: string): Promise<InvitationRecord | null> {
    const target = email.trim().toLowerCase();
    return Promise.resolve(this.live().find((i) => i.email === target) ?? null);
  }

  create(input: {
    id: string;
    email: string;
    role: Role;
    tokenHash: string;
    expiresAt: Date;
    invitedBy: UserId;
  }): Promise<void> {
    this.store.set(input.id, {
      id: input.id,
      tenantId: this.tenantId,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: this.now(),
      acceptedAt: null,
      revokedAt: null,
    });
    return Promise.resolve();
  }

  revoke(id: string): Promise<boolean> {
    const found = this.store.get(id);
    if (
      found === undefined ||
      found.tenantId !== this.tenantId ||
      found.acceptedAt !== null ||
      found.revokedAt !== null
    ) {
      return Promise.resolve(false);
    }

    this.store.set(id, { ...found, revokedAt: this.now() });
    return Promise.resolve(true);
  }
}

export class InMemoryMembershipRepository implements MembershipRepository {
  constructor(
    private readonly store: Map<string, StoredMember>,
    private readonly tenantId: TenantId,
  ) {}

  private scoped(): StoredMember[] {
    return [...this.store.values()].filter((m) => m.tenantId === this.tenantId);
  }

  private key(userId: string): string {
    return `${this.tenantId}:${userId}`;
  }

  list(): Promise<readonly MemberRecord[]> {
    return Promise.resolve(this.scoped().sort((a, b) => a.role.localeCompare(b.role)));
  }

  findByUserId(userId: UserId): Promise<MemberRecord | null> {
    return Promise.resolve(this.store.get(this.key(userId)) ?? null);
  }

  /**
   * Imita el trigger `enforce_last_owner`.
   *
   * Lanza en vez de devolver un error, porque es lo que hace Postgres y lo que
   * el caso de uso tiene que saber traducir. Si el doble devolviera un `Result`,
   * ese `catch` no estaria probado por ningun test rapido.
   */
  private guardLastOwner(userId: UserId, becoming: Role | null): void {
    const current = this.store.get(this.key(userId));
    if (current === undefined || current.role !== 'owner') return;
    if (becoming === 'owner') return;

    const otherOwners = this.scoped().filter(
      (m) => m.role === 'owner' && m.status === 'active' && m.userId !== userId,
    );
    if (otherOwners.length === 0) {
      throw new Error('LAST_OWNER: un tenant necesita al menos un propietario activo');
    }
  }

  changeRole(userId: UserId, role: Role): Promise<void> {
    this.guardLastOwner(userId, role);
    const current = this.store.get(this.key(userId));
    if (current !== undefined) this.store.set(this.key(userId), { ...current, role });
    return Promise.resolve();
  }

  remove(userId: UserId): Promise<void> {
    this.guardLastOwner(userId, null);
    this.store.delete(this.key(userId));
    return Promise.resolve();
  }

  /** Solo para preparar escenarios de test y para la siembra de el driver en memoria. */
  seed(member: MemberRecord): void {
    this.store.set(this.key(member.userId), { ...member, tenantId: this.tenantId });
  }
}

export class InMemoryTenantSettingsRepository implements TenantSettingsRepository {
  constructor(
    private readonly store: Map<string, TenantSettingsUpdate>,
    private readonly tenantId: TenantId,
  ) {}

  update(patch: TenantSettingsUpdate): Promise<void> {
    this.store.set(this.tenantId, { ...this.store.get(this.tenantId), ...patch });
    return Promise.resolve();
  }
}

/**
 * Tokens predecibles para los tests.
 *
 * El hash es una transformacion trivial a proposito: aqui no se comprueba
 * criptografia, se comprueba que el caso de uso NUNCA guarda el valor en claro.
 * Con un hash real ese error se vería igual de mal, pero el test no podría
 * afirmar que lo guardado no es el token — y esa es la aserción que importa.
 */
export function stubTokenFactory(prefix = 'token'): TokenFactory {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      const value = `${prefix}-${counter}`;
      return { value, hash: `sha256:${value}` };
    },
  };
}
