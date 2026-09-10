import { describe, it, expect } from 'vitest';
import { Plan, PLAN_CODES, RESOURCES, FEATURES } from './plan';

const plan = Plan.of('free');

describe('Plan — cuotas', () => {
  it('no bloquea por mucho que haya registrado', () => {
    expect(plan.checkQuota('customers', 0).ok).toBe(true);
    expect(plan.checkQuota('customers', 50).ok).toBe(true);
    expect(plan.checkQuota('customers', 5_000_000).ok).toBe(true);
  });

  it('tampoco bloquea una importacion grande de golpe', () => {
    // La cantidad solicitada se sigue teniendo en cuenta; lo que ya no hay es techo
    // contra el que chocar.
    expect(plan.checkQuota('customers', 45, 10_000).ok).toBe(true);
  });

  it('deja el mismo margen en todos los recursos', () => {
    for (const resource of RESOURCES) {
      expect(plan.checkQuota(resource, 1_000_000).ok, resource).toBe(true);
    }
  });

  it('expone un estado coherente para la interfaz', () => {
    const status = plan.quota('customers', 45);
    expect(status).toMatchObject({
      resource: 'customers',
      current: 45,
      exceeded: false,
    });
    // Sin techo, la fraccion consumida es cero: nada que dibujar y nada de lo que avisar.
    expect(status.ratio).toBe(0);
  });

  it('nunca avisa de que se acerca a un limite que no existe', () => {
    expect(plan.isNearLimit('customers', 40)).toBe(false);
    expect(plan.isNearLimit('customers', 10_000_000)).toBe(false);
  });

  it('nunca reporta restante negativo aunque los datos vengan pasados de rosca', () => {
    expect(plan.quota('customers', 999).remaining).toBeGreaterThanOrEqual(0);
  });
});

describe('Plan — modulos', () => {
  it('incluye TODOS los modulos del sistema', () => {
    expect(plan.features).toHaveLength(FEATURES.length);
    for (const feature of FEATURES) {
      expect(plan.has(feature), feature).toBe(true);
    }
  });

  it('no bloquea ningun modulo', () => {
    for (const feature of FEATURES) {
      expect(plan.checkFeature(feature).ok, feature).toBe(true);
    }
  });

  it('reportes, compras y exportacion de auditoria estan disponibles', () => {
    // Los tres que hasta ahora estaban detras del plan de pago. Se nombran uno a uno
    // a proposito: es la regresion concreta que este archivo tiene que cazar.
    expect(plan.has('reports')).toBe(true);
    expect(plan.has('purchasing')).toBe(true);
    expect(plan.has('audit_export')).toBe(true);
  });
});

describe('Plan — construccion', () => {
  it('parse acepta los codigos conocidos y rechaza el resto', () => {
    for (const code of PLAN_CODES) {
      expect(Plan.parse(code).ok).toBe(true);
    }
    const bogus = Plan.parse('enterprise');
    expect(bogus.ok).toBe(false);
    if (!bogus.ok) expect(bogus.error.kind).toBe('UnknownPlan');
  });

  it('todos los codigos dan el MISMO plan sin restricciones', () => {
    // `tenants.plan_code` sigue existiendo en la base y el clonador de demostraciones
    // lo copia. Este test es el que garantiza que ese valor ya no puede recortarle
    // nada a nadie: da igual con cual se entre.
    for (const code of PLAN_CODES) {
      const each = Plan.of(code);
      for (const feature of FEATURES) {
        expect(each.has(feature), `${code} / ${feature}`).toBe(true);
      }
      for (const resource of RESOURCES) {
        expect(each.checkQuota(resource, 1_000_000).ok, `${code} / ${resource}`).toBe(true);
      }
    }
  });
});

describe('Plan — coherencia de las definiciones', () => {
  it('todo plan define un limite para TODOS los recursos', () => {
    // Un recurso sin limite definido daria `undefined`, y `current + amount > undefined`
    // es siempre falso: la cuota quedaria desactivada en silencio. Hoy eso coincide con
    // lo que queremos, pero por accidente, y un accidente no es una decision. Este test
    // sigue exigiendo que el limite este declarado.
    for (const code of PLAN_CODES) {
      const each = Plan.of(code);
      for (const resource of RESOURCES) {
        const limit = each.limitFor(resource);
        expect(typeof limit, `${code} no define limite para ${resource}`).toBe('number');
        expect(limit).toBeGreaterThan(0);
      }
    }
  });
});
