import { describe, it, expect } from 'vitest';
import { Customer } from './customer';
import { Money } from '../shared/value-objects/money';
import { asId, type CustomerId, type TenantId } from '../shared/entity';
import { unwrap } from '../shared/result';

const ID = asId<CustomerId>('c-1');
const TENANT = asId<TenantId>('t-1');
const AT = new Date('2026-09-06T12:00:00.000Z');
const usd = (v: string) => unwrap(Money.of(v, 'USD'));

const make = (overrides: Partial<Parameters<typeof Customer.create>[0]> = {}) =>
  Customer.create({
    id: ID,
    tenantId: TENANT,
    code: 'cli-001',
    name: 'Bodega La Esquina',
    createdAt: AT,
    ...overrides,
  });

describe('Customer — creacion', () => {
  it('normaliza el codigo a mayusculas y recorta el nombre', () => {
    const customer = unwrap(make({ code: '  cli-001  ', name: '  Bodega La Esquina  ' }));
    expect(customer.code).toBe('CLI-001');
    expect(customer.name).toBe('Bodega La Esquina');
  });

  it('normaliza el email a minusculas', () => {
    const customer = unwrap(make({ email: '  Contacto@Bodega.COM  ' }));
    expect(customer.email).toBe('contacto@bodega.com');
  });

  it('convierte las cadenas vacias en null en vez de guardarlas', () => {
    const customer = unwrap(make({ email: '   ', phone: '', taxId: '  ' }));
    expect(customer.email).toBeNull();
    expect(customer.phone).toBeNull();
    expect(customer.taxId).toBeNull();
  });

  it('exige nombre y codigo', () => {
    for (const field of ['name', 'code'] as const) {
      const result = make({ [field]: '   ' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatchObject({ kind: 'Required', field });
    }
  });

  it('rechaza nombres demasiado cortos o demasiado largos', () => {
    expect(make({ name: 'A' }).ok).toBe(false);
    expect(make({ name: 'A'.repeat(121) }).ok).toBe(false);
    expect(make({ name: 'Ab' }).ok).toBe(true);
  });

  it('rechaza emails con forma invalida, sin ser exquisito de mas', () => {
    for (const bad of ['sin-arroba', 'a@b', '@dominio.com', 'con espacio@x.com']) {
      expect(make({ email: bad }).ok, `deberia rechazar "${bad}"`).toBe(false);
    }
    // Direcciones raras pero validas: no se rechazan.
    for (const good of ['a+etiqueta@sub.dominio.co', "o'brien@tienda.com.ve"]) {
      expect(make({ email: good }).ok, `deberia aceptar "${good}"`).toBe(true);
    }
  });

  it('rechaza un limite de credito negativo', () => {
    expect(make({ creditLimit: usd('-100') }).ok).toBe(false);
  });

  it('registra un evento de dominio al crearse', () => {
    const events = unwrap(make()).pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'customer.created', tenantId: TENANT });
  });

  it('vacia los eventos tras recogerlos, para no publicarlos dos veces', () => {
    const customer = unwrap(make());
    expect(customer.pullDomainEvents()).toHaveLength(1);
    expect(customer.pullDomainEvents()).toHaveLength(0);
    expect(customer.hasPendingEvents).toBe(false);
  });
});

describe('Customer — credito', () => {
  it('sin limite, siempre hay credito disponible', () => {
    const customer = unwrap(make());
    expect(customer.canAfford(usd('999999'), usd('1000'))).toBe(true);
  });

  it('permite una venta que cabe justo en el limite', () => {
    const customer = unwrap(make({ creditLimit: usd('1000') }));
    expect(customer.canAfford(usd('900'), usd('100'))).toBe(true);
  });

  it('bloquea la venta que se pasa del limite, aunque sea por un centimo', () => {
    const customer = unwrap(make({ creditLimit: usd('1000') }));
    expect(customer.canAfford(usd('900'), usd('100.01'))).toBe(false);
  });

  it('no deja fijar un limite por debajo del saldo pendiente', () => {
    // Bajaria al cliente a mora retroactiva sin que haya comprado nada nuevo.
    const customer = unwrap(make({ creditLimit: usd('1000') }));
    const result = customer.setCreditLimit(usd('300'), usd('500'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('CreditLimitBelowBalance');
    expect(customer.creditLimit?.toString()).toBe('1000.00');
  });

  it('permite fijar un limite igual al saldo pendiente', () => {
    const customer = unwrap(make());
    expect(customer.setCreditLimit(usd('500'), usd('500')).ok).toBe(true);
  });

  it('permite retirar el limite por completo', () => {
    const customer = unwrap(make({ creditLimit: usd('1000') }));
    expect(customer.setCreditLimit(null, usd('900')).ok).toBe(true);
    expect(customer.creditLimit).toBeNull();
  });

  it('rechaza un limite negativo tambien al actualizarlo', () => {
    const customer = unwrap(make());
    expect(customer.setCreditLimit(usd('-1'), usd('0')).ok).toBe(false);
  });
});

describe('Customer — archivado', () => {
  it('archiva en lugar de borrar, para no dejar documentos huerfanos', () => {
    const customer = unwrap(make());
    customer.pullDomainEvents();

    expect(customer.archive(AT).ok).toBe(true);
    expect(customer.isArchived).toBe(true);
    expect(customer.pullDomainEvents()[0]).toMatchObject({ type: 'customer.archived' });
  });

  it('archivar dos veces no genera un segundo evento', () => {
    const customer = unwrap(make());
    customer.pullDomainEvents();
    customer.archive(AT);
    customer.pullDomainEvents();

    customer.archive(AT);
    expect(customer.pullDomainEvents()).toHaveLength(0);
  });

  it('se puede restaurar', () => {
    const customer = unwrap(make());
    customer.archive(AT);
    customer.restore();
    expect(customer.isArchived).toBe(false);
  });
});

describe('Customer — modificacion', () => {
  it('renombra validando igual que al crear', () => {
    const customer = unwrap(make());
    expect(customer.rename('Bodega Central').ok).toBe(true);
    expect(customer.name).toBe('Bodega Central');
    expect(customer.rename('A').ok).toBe(false);
    expect(customer.rename('A'.repeat(200)).ok).toBe(false);
    expect(customer.name).toBe('Bodega Central');
  });

  it('actualiza el contacto validando el email', () => {
    const customer = unwrap(make());
    expect(customer.updateContact({ email: 'NUEVO@x.com', phone: ' 0414-1234567 ' }).ok).toBe(true);
    expect(customer.email).toBe('nuevo@x.com');
    expect(customer.phone).toBe('0414-1234567');
    expect(customer.updateContact({ email: 'roto' }).ok).toBe(false);
  });

  it('rehydrate reconstruye sin revalidar ni emitir eventos', () => {
    const original = unwrap(make());
    original.pullDomainEvents();
    const restored = Customer.rehydrate(original.id, original.snapshot());
    expect(restored.hasPendingEvents).toBe(false);
    expect(restored.equals(original)).toBe(true);
    expect(restored.code).toBe(original.code);
  });
});

describe('Customer — el contacto se edita campo a campo', () => {
  const conContacto = () =>
    unwrap(
      make({
        email: 'viejo@x.com',
        phone: '0212-5551234',
        address: { line1: 'Av. Principal 12', city: 'Valencia', state: 'Carabobo' },
      }),
    );

  it('la direccion SE PUEDE vaciar', () => {
    const customer = conContacto();
    expect(customer.updateContact({ address: null }).ok).toBe(true);
    expect(customer.address).toBeNull();
  });

  it('omitir un campo lo deja como estaba, en vez de borrarlo', () => {
    const customer = conContacto();

    expect(customer.updateContact({ phone: '0414-9999999' }).ok).toBe(true);

    expect(customer.phone).toBe('0414-9999999');
    expect(customer.email).toBe('viejo@x.com');
    expect(customer.address?.city).toBe('Valencia');
  });

  it('pasar null borra, y es distinto de omitir', () => {
    const customer = conContacto();
    expect(customer.updateContact({ email: null }).ok).toBe(true);
    expect(customer.email).toBeNull();
    expect(customer.phone).toBe('0212-5551234');
  });

  it('un email invalido no deja a medias el resto de los campos', () => {
    const customer = conContacto();
    expect(customer.updateContact({ email: 'roto', phone: '0414-0000000' }).ok).toBe(false);
    expect(customer.phone).toBe('0212-5551234');
  });
});

describe('Customer — identificador fiscal', () => {
  it('se fija, se recorta y se puede quitar', () => {
    const customer = unwrap(make());
    expect(customer.setTaxId('  J-12345678-9  ').ok).toBe(true);
    expect(customer.taxId).toBe('J-12345678-9');

    expect(customer.setTaxId(null).ok).toBe(true);
    expect(customer.taxId).toBeNull();
  });

  it('rechaza el que no cabe, y el rechazo no cambia nada', () => {
    const customer = unwrap(make({ taxId: 'J-1' }));
    expect(customer.setTaxId('J'.repeat(25)).ok).toBe(false);
    expect(customer.taxId).toBe('J-1');
  });

  it('crear con un identificador que no cabe tambien se rechaza', () => {
    // El limite estaba solo en el contrato Zod: un caso de uso invocado desde una
    // importacion o una semilla lo saltaba entero.
    expect(make({ taxId: 'J'.repeat(25) }).ok).toBe(false);
  });
});
