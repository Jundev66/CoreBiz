import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { Plan, asId, type Role, type TenantId, type UserId } from '@corebiz/domain';
import type { TenantContext } from '@corebiz/application';
import { get } from './client';
import { httpCommands } from './commands';
import { httpReadModels } from './read-models';

/**
 * Lo que antes era el composition root.
 *
 * `apps/web` ya no decide QUE implementacion cumple cada puerto: eso ocurre ahora en
 * `apps/api`. Aqui solo se resuelve QUIEN esta operando —preguntandoselo a la API— y
 * se devuelve la misma forma que devolvia `forRequest()`, para que las 29 paginas y
 * las Server Actions sigan escritas igual.
 *
 * Que esa forma se haya podido conservar entera no es suerte: es que el contenedor
 * devolvia funciones ya inyectadas y modelos de lectura detras de un puerto, en lugar
 * de un contenedor consultable. Sustituir el otro lado del puerto no cambia el codigo
 * que lo usa.
 */

/** Empresa a la que pertenece quien opera, tal como la devuelve la API. */
export interface Membership {
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly role: string;
  readonly planCode: string;
  readonly isDemo: boolean;
}

/**
 * Identidad de quien esta operando, ya resuelta.
 *
 * Viaja junto al contenedor para que el marco de la aplicacion pueda mostrar la cuenta
 * activa y el selector de empresa sin volver a preguntar.
 */
export interface SessionInfo {
  readonly email: string | null;
  readonly memberships: readonly Membership[];
  /**
   * True mientras se opera un tenant de demostracion. La interfaz lo usa para pintar
   * el aviso de caducidad y ofrecer "crear mi cuenta" junto a "salir": quien esta
   * probando el sistema necesita las dos cosas.
   */
  readonly isDemo: boolean;
  /**
   * Cuando desaparece el sandbox, o null si el tenant no caduca. Viaja hasta la
   * interfaz porque el aviso tiene que dar la HORA CONCRETA y no "en 24 horas": quien
   * entra a las once de la noche merece saber que es manana a las once.
   */
  readonly expiresAt: Date | null;
  /**
   * True solo con `DATA_DRIVER=memory`. Hace falta porque "no caduca" NO significa
   * "es el modo memoria": la plantilla de demostracion sobre Postgres tampoco caduca.
   */
  readonly memoryDriver: boolean;
}

/** Cookies con las que la demo permite cambiar de rol y de plan sin reiniciar nada. */
export { DEMO_ROLE_COOKIE, DEMO_PLAN_COOKIE } from './client';

export type DataDriver = 'postgres' | 'memory';

/**
 * Driver activo, leido del entorno.
 *
 * La interfaz ya no elige adaptador —eso lo hace la API— pero sigue necesitando saber
 * en que modo corre el sistema para dos cosas concretas: no ofrecer el alta de cuenta
 * cuando no hay Supabase detras, y avisar de que los datos son de mentira. Las dos
 * aplicaciones reciben la misma variable, y `pnpm dev:nodb` la pone para ambas.
 */
export function activeDriver(): DataDriver {
  return process.env.DATA_DRIVER === 'memory' ? 'memory' : 'postgres';
}

interface SessionResponse {
  readonly email: string | null;
  readonly memberships: readonly Membership[];
  readonly tenant: {
    readonly id: string;
    readonly slug: string;
    readonly isDemo: boolean;
    readonly expiresAt: string | null;
    readonly settings: {
      readonly taxLabel: string;
      readonly taxRateBp: number;
      readonly baseCurrency: 'USD' | 'VES';
      readonly exchangeRateScaled: string | null;
      readonly exchangeRateAt: string | null;
    };
  } | null;
  readonly actor: { readonly userId: string; readonly role: string } | null;
  readonly planCode: string | null;
  readonly memoryDriver: boolean;
}

/**
 * Monta el contenedor para el request en curso.
 *
 * `cache()` de React, y no la deduplicacion de `fetch` de Next, que NO aplica con
 * `cache: 'no-store'`. Sin esto, una pagina que llama aqui en su propio Server
 * Component y otra vez dentro de `<Shell>` pediria la sesion dos veces por render:
 * dos viajes a Render para pintar la misma cabecera.
 */
export const apiForRequest = cache(async (_tenantSlug?: string) => {
  const response = await get<SessionResponse>('/v1/session');

  // Cuenta creada pero sin empresa: pasa cuando el alta exige confirmar el correo y la
  // primera sesion llega despues. Se pregunta el nombre del negocio una sola vez.
  if (response.tenant === null || response.actor === null || response.planCode === null) {
    redirect('/onboarding');
  }

  const ctx: TenantContext = {
    tenantId: asId<TenantId>(response.tenant.id),
    tenantSlug: response.tenant.slug,
    actor: {
      userId: asId<UserId>(response.actor.userId),
      role: response.actor.role as Role,
    },
    /*
     * El plan llega como CODIGO y se reconstruye aqui.
     *
     * `Plan` es una clase con comportamiento —`quota()`, `has()`, `checkFeature()`— y
     * eso no cruza HTTP. `@corebiz/domain` es puro y no tiene dependencias, asi que la
     * interfaz puede seguir importandolo: es lo que permite que las pantallas sigan
     * preguntando `ctx.plan.quota('customers', n)` sin cambiar una linea.
     */
    plan: Plan.of(response.planCode === 'pro' ? 'pro' : 'free'),
    settings: {
      taxLabel: response.tenant.settings.taxLabel,
      taxRateBp: response.tenant.settings.taxRateBp,
      baseCurrency: response.tenant.settings.baseCurrency,
      // Un entero escalado viaja como cadena porque no cabe en un number de JSON.
      exchangeRateScaled:
        response.tenant.settings.exchangeRateScaled === null
          ? null
          : BigInt(response.tenant.settings.exchangeRateScaled),
      exchangeRateAt:
        response.tenant.settings.exchangeRateAt === null
          ? null
          : new Date(response.tenant.settings.exchangeRateAt),
    },
    isDemo: response.tenant.isDemo,
  };

  const session: SessionInfo = {
    email: response.email,
    memberships: response.memberships,
    isDemo: response.tenant.isDemo,
    expiresAt: response.tenant.expiresAt === null ? null : new Date(response.tenant.expiresAt),
    memoryDriver: response.memoryDriver,
  };

  return { ctx, session, queries: httpReadModels(), ...httpCommands() };
});
