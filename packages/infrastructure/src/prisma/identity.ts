import { getPrisma } from '@corebiz/db';
import { asUser } from './session';

/**
 * Lo que la aplicacion necesita saber ANTES de tener un tenant activo.
 *
 * Estas dos operaciones viven aparte de los repositorios a proposito: no pertenecen a
 * ningun tenant, y meterlas en el Unit of Work obligaria a inventar un contexto de tenant
 * para poder preguntar a que tenants pertenece alguien.
 *
 * Las dos entran por funciones SQL acotadas que resuelven la identidad con `auth.uid()` y
 * NO aceptan un identificador de usuario como parametro. Esa diferencia es la que impide
 * que un fallo aqui se convierta en "dime las empresas de cualquiera": aunque este codigo
 * pasara el identificador equivocado, la base de datos seguiria respondiendo por el
 * usuario de la sesion.
 */

export interface Membership {
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly role: string;
  readonly planCode: string;
  readonly isDemo: boolean;
  readonly status: string;
}

interface MembershipRow {
  tenant_id: string;
  slug: string;
  name: string;
  role: string;
  plan_code: string;
  is_demo: boolean;
  status: string;
}

/** Empresas activas del usuario de la sesion, ordenadas por nombre. */
export async function listMemberships(url: string, userId: string): Promise<readonly Membership[]> {
  const rows = await asUser(
    getPrisma(url),
    userId,
    (tx) => tx.$queryRaw<MembershipRow[]>`select * from app.my_memberships()`,
  );

  return rows.map((r) => ({
    tenantId: r.tenant_id,
    slug: r.slug,
    name: r.name,
    role: r.role,
    planCode: r.plan_code,
    isDemo: r.is_demo,
    status: r.status,
  }));
}

export type ProvisionError = 'ALREADY_OWNER' | 'INVALID_NAME' | 'INVALID_CURRENCY' | 'UNKNOWN';

export interface ProvisionResult {
  readonly ok: boolean;
  readonly tenantId?: string;
  readonly error?: ProvisionError;
}

/**
 * Crea la empresa del usuario recien registrado.
 *
 * Devuelve un resultado en lugar de lanzar porque `ALREADY_OWNER` no es un fallo del
 * sistema: es lo que pasa cuando alguien pulsa dos veces el boton de registro, y la
 * pantalla tiene que saber distinguirlo de un error de verdad para no asustar a quien
 * acaba de crear su cuenta.
 */
export async function provisionTenant(
  url: string,
  userId: string,
  input: { name: string; baseCurrency?: 'USD' | 'VES' },
): Promise<ProvisionResult> {
  try {
    const rows = await asUser(
      getPrisma(url),
      userId,
      (tx) =>
        tx.$queryRaw<{ tenant_id: string }[]>`
        select app.provision_tenant(${input.name}, ${input.baseCurrency ?? 'USD'}) as tenant_id
      `,
    );

    const tenantId = rows[0]?.tenant_id;
    return tenantId === undefined ? { ok: false, error: 'UNKNOWN' } : { ok: true, tenantId };
  } catch (error) {
    // Los codigos viajan en el texto de la excepcion porque plpgsql no tiene errores
    // tipados. Se buscan en toda la cadena de causas: el cliente envuelve el error de
    // Postgres y el motivo real queda un nivel por debajo.
    const text = messageChain(error);
    if (text.includes('ALREADY_OWNER')) return { ok: false, error: 'ALREADY_OWNER' };
    if (text.includes('INVALID_NAME')) return { ok: false, error: 'INVALID_NAME' };
    if (text.includes('INVALID_CURRENCY')) return { ok: false, error: 'INVALID_CURRENCY' };
    return { ok: false, error: 'UNKNOWN' };
  }
}

function messageChain(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    parts.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(' | ');
}
