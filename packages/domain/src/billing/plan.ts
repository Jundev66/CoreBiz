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
 * Los limites del plan gratuito no son arbitrarios: buscan que un comercio muy pequeno
 * pueda trabajar de verdad, y a la vez que el consumo agregado quepa holgadamente en los
 * 500 MB de base de datos del plan gratuito de Supabase.
 */
const PLAN_DEFINITIONS: Readonly<Record<PlanCode, PlanDefinition>> = {
  free: {
    limits: {
      customers: 50,
      products: 100,
      suppliers: 25,
      documents_month: 100,
      users: 2,
    },
    features: [],
  },
  pro: {
    limits: {
      customers: 5_000,
      products: 5_000,
      suppliers: 1_000,
      documents_month: 2_000,
      users: 15,
    },
    features: ['reports', 'audit_export', 'purchasing'],
  },
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

  get isFree(): boolean {
    return this.code === 'free';
  }

  /** Avisa cuando conviene mostrar el aviso de "te estas quedando sin espacio". */
  isNearLimit(resource: Resource, current: number, threshold = 0.8): boolean {
    return this.quota(resource, current).ratio >= threshold;
  }
}
