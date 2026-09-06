import { describe, it, expect } from 'vitest';
import { Plan, PLAN_CODES, RESOURCES, FEATURES } from './plan';

const free = Plan.of('free');
const pro = Plan.of('pro');

describe('Plan — cuotas', () => {
  it('permite crear mientras quede espacio', () => {
    const result = free.checkQuota('customers', 49);
    expect(result.ok).toBe(true);
  });

  it('bloquea exactamente en el limite, no despues', () => {
    // Con 50 clientes y limite 50, crear el 51 debe fallar.
    const result = free.checkQuota('customers', 50);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('QuotaExceeded');
      expect(result.error.limit).toBe(50);
      expect(result.error.current).toBe(50);
    }
  });

  it('tiene en cuenta la cantidad solicitada, no solo una unidad', () => {
    // Importar 10 clientes teniendo 45 y limite 50 debe fallar antes de empezar.
    expect(free.checkQuota('customers', 45, 10).ok).toBe(false);
    expect(free.checkQuota('customers', 45, 5).ok).toBe(true);
  });

  it('el plan PRO da margen muy superior sobre el mismo recurso', () => {
    expect(pro.limitFor('customers')).toBeGreaterThan(free.limitFor('customers'));
    expect(pro.checkQuota('customers', 100).ok).toBe(true);
  });

  it('expone el estado para pintarlo en la interfaz', () => {
    const status = free.quota('customers', 45);
    expect(status).toMatchObject({
      resource: 'customers',
      limit: 50,
      current: 45,
      remaining: 5,
      exceeded: false,
    });
    expect(status.ratio).toBeCloseTo(0.9);
  });

  it('avisa cuando se acerca al limite', () => {
    expect(free.isNearLimit('customers', 39)).toBe(false);
    expect(free.isNearLimit('customers', 40)).toBe(true);
  });

  it('nunca reporta restante negativo aunque los datos vengan pasados de rosca', () => {
    expect(free.quota('customers', 999).remaining).toBe(0);
    expect(free.quota('customers', 999).ratio).toBe(1);
  });
});

describe('Plan — gating de modulos', () => {
  it('el plan gratuito no incluye ningun modulo de pago', () => {
    expect(free.features).toHaveLength(0);
    for (const feature of FEATURES) {
      expect(free.has(feature)).toBe(false);
    }
  });

  it('el plan PRO desbloquea reportes, panel y compras', () => {
    expect(pro.has('reports')).toBe(true);
    expect(pro.has('dashboard')).toBe(true);
    expect(pro.has('purchasing')).toBe(true);
  });

  it('al bloquear indica que plan hace falta, para poder ofrecer el upgrade', () => {
    const result = free.checkFeature('reports');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('FeatureNotAvailable');
      expect(result.error.requiredPlan).toBe('pro');
    }
  });

  it('multi_warehouse esta declarado pero aun no lo ofrece ningun plan', () => {
    // Queda reservado para mas adelante; el gating ya funciona y no rompe nada.
    expect(pro.has('multi_warehouse')).toBe(false);
    const result = pro.checkFeature('multi_warehouse');
    expect(result.ok).toBe(false);
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

  it('isFree distingue el plan gratuito', () => {
    expect(free.isFree).toBe(true);
    expect(pro.isFree).toBe(false);
  });
});

describe('Plan — coherencia de las definiciones', () => {
  it('todo plan define un limite para TODOS los recursos', () => {
    // Un recurso sin limite definido daria `undefined` y la comparacion seria siempre
    // falsa: la cuota quedaria desactivada en silencio. Este test lo impide.
    for (const code of PLAN_CODES) {
      const plan = Plan.of(code);
      for (const resource of RESOURCES) {
        const limit = plan.limitFor(resource);
        expect(typeof limit, `${code} no define limite para ${resource}`).toBe('number');
        expect(limit).toBeGreaterThan(0);
      }
    }
  });

  it('PRO nunca es mas restrictivo que FREE en ningun recurso', () => {
    for (const resource of RESOURCES) {
      expect(
        pro.limitFor(resource),
        `PRO limita ${resource} mas que FREE: seria un downgrade de pago`,
      ).toBeGreaterThanOrEqual(free.limitFor(resource));
    }
  });

  it('PRO incluye todas las funciones de FREE', () => {
    for (const feature of free.features) {
      expect(pro.has(feature)).toBe(true);
    }
  });
});
