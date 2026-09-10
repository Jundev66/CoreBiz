import { ok, err, type Result } from '../shared/result';

/**
 * Planes, cuotas y gating de modulos.
 *
 * La regla vive AQUI, en el dominio, y el caso de uso la consulta. La interfaz solo
 * refleja la decision: deshabilitar un boton no es un limite, es una sugerencia.
 * Cualquiera puede invocar la Server Action directamente.
 */

export const PLAN_CODES = ['free', 'pro'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/** Recursos contados contra una cuota. */
export const RESOURCES = [
  'customers',
  'products',
  'suppliers',
  'documents_month',
  'users',
] as const;
export type Resource = (typeof RESOURCES)[number];

/**
 * Modulos que se activan o bloquean segun el plan.
 *
 * Solo estan los que el sistema SABE hacer. Aqui hubo tres mas —`dashboard`,
 * `export_csv`, `multi_warehouse`— reservados "para mas adelante", y se fueron: una
 * bandera que nadie comprueba no reserva nada, solo hace creer que la funcion existe
 * a quien lee esta lista para saber que ofrece el producto. Los modulos pendientes
 * se anuncian donde se ven, en su propia pantalla, no en una constante.
 */
export const FEATURES = ['reports', 'audit_export', 'purchasing'] as const;
export type Feature = (typeof FEATURES)[number];

export type QuotaError = {
  kind: 'QuotaExceeded';
  resource: Resource;
  limit: number;
  current: number;
};

export type FeatureError = {
  kind: 'FeatureNotAvailable';
  feature: Feature;
  requiredPlan: PlanCode;
};

interface PlanDefinition {
  readonly limits: Readonly<Record<Resource, number>>;
  readonly features: readonly Feature[];
}

/**
 * Un solo plan, con todo incluido y sin techo.
 *
 * Antes habia dos —uno gratuito con limites y uno de pago que los levantaba— y CoreBiz
 * dejo de ser un producto que se cobra. Un candado sobre una funcion que nadie va a
 * vender no protege ingresos: solo le dice a quien prueba el sistema que la mitad no
 * es para el.
 *
 * Lo que NO se ha hecho es arrancar la maquinaria. La clase `Plan` sigue entera, los
 * siete casos de uso siguen preguntando por su cuota y los guards de la API siguen
 * consultando el modulo. Todo eso sigue en su sitio, probado, y ahora responde que si.
 * Volver a cobrar es escribir aqui otra definicion; no es reescribir el dominio.
 */
const SIN_LIMITES: PlanDefinition = {
  limits: {
    customers: Number.POSITIVE_INFINITY,
    products: Number.POSITIVE_INFINITY,
    suppliers: Number.POSITIVE_INFINITY,
    documents_month: Number.POSITIVE_INFINITY,
    users: Number.POSITIVE_INFINITY,
  },
  features: [...FEATURES],
};

/**
 * Los dos codigos sobreviven, y apuntan al mismo plan.
 *
 * `tenants.plan_code` existe en la base con una restriccion que solo acepta estos dos
 * valores, y el clonador de demostraciones lo copia. Quitarlos costaria una migracion
 * para no ganar nada: lo que decide que puede hacer alguien es esta definicion, y hoy
 * es la misma se mire por donde se mire.
 */
const PLAN_DEFINITIONS: Readonly<Record<PlanCode, PlanDefinition>> = {
  free: SIN_LIMITES,
  pro: SIN_LIMITES,
};

/** Resultado de consultar una cuota, con lo necesario para explicarla en pantalla. */
export interface QuotaStatus {
  readonly resource: Resource;
  readonly limit: number;
  readonly current: number;
  readonly remaining: number;
  readonly exceeded: boolean;
  /** Fraccion consumida entre 0 y 1. Alimenta la barra de progreso de la interfaz. */
  readonly ratio: number;
}

export class Plan {
  private constructor(
    readonly code: PlanCode,
    private readonly definition: PlanDefinition,
  ) {
    Object.freeze(this);
  }

  static of(code: PlanCode): Plan {
    return new Plan(code, PLAN_DEFINITIONS[code]);
  }

  static parse(raw: string): Result<Plan, { kind: 'UnknownPlan'; raw: string }> {
    return (PLAN_CODES as readonly string[]).includes(raw)
      ? ok(Plan.of(raw as PlanCode))
      : err({ kind: 'UnknownPlan', raw });
  }

  limitFor(resource: Resource): number {
    return this.definition.limits[resource];
  }

  /** Estado completo de una cuota. La interfaz lo usa para mostrar "45 / 50 clientes". */
  quota(resource: Resource, current: number): QuotaStatus {
    const limit = this.limitFor(resource);
    return {
      resource,
      limit,
      current,
      remaining: Math.max(0, limit - current),
      exceeded: current >= limit,
      ratio: limit === 0 ? 1 : Math.min(1, current / limit),
    };
  }

  /**
   * Comprueba si cabe crear `amount` unidades mas del recurso.
   * Devuelve un `Result` para que el caso de uso lo propague sin excepciones.
   */
  checkQuota(resource: Resource, current: number, amount = 1): Result<QuotaStatus, QuotaError> {
    const limit = this.limitFor(resource);
    if (current + amount > limit) {
      return err({ kind: 'QuotaExceeded', resource, limit, current });
    }
    return ok(this.quota(resource, current));
  }

  has(feature: Feature): boolean {
    return this.definition.features.includes(feature);
  }

  /** Como `has`, pero en forma de `Result` con el plan necesario para el aviso de upgrade. */
  checkFeature(feature: Feature): Result<true, FeatureError> {
    if (this.has(feature)) return ok(true);
    const requiredPlan = PLAN_CODES.find((code) =>
      PLAN_DEFINITIONS[code].features.includes(feature),
    );
    return err({ kind: 'FeatureNotAvailable', feature, requiredPlan: requiredPlan ?? 'pro' });
  }

  get features(): readonly Feature[] {
    return this.definition.features;
  }

  /** Avisa cuando conviene mostrar el aviso de "te estas quedando sin espacio". */
  isNearLimit(resource: Resource, current: number, threshold = 0.8): boolean {
    return this.quota(resource, current).ratio >= threshold;
  }
}
