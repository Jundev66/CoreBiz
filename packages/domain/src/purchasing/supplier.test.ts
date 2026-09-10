import { describe, it, expect } from 'vitest';
import { Supplier } from './supplier';
import { asId, type SupplierId, type TenantId } from '../shared/entity';
import { unwrap } from '../shared/result';

/**
 * `Supplier` no tenia test propio, y hasta ahora se defendia solo: era `create`,
 * `archive` y `restore`. Con los mutadores deja de serlo, y lo que hay que proteger
 * no es que guarde un nombre — es que se comporte IGUAL que `Customer`.
 *
 * Son dos fichas de contacto y lo unico que las separa es de que lado del mostrador
 * esta cada una. Si una borra al omitir y la otra conserva, hay que recordar cual es
 * cual cada vez que se toca una de las dos.
 */

const ID = asId<SupplierId>('s-1');
const TENANT = asId<TenantId>('t-1');
const AT = new Date('2026-09-06T12:00:00.000Z');

const make = (overrides: Partial<Parameters<typeof Supplier.create>[0]> = {}) =>
  Supplier.create({
    id: ID,
    tenantId: TENANT,
    code: 'prv-001',
    name: 'Distribuidora del Centro',
    createdAt: AT,
    ...overrides,
  });

describe('Supplier — creacion', () => {
  it('normaliza el codigo a mayusculas y recorta el nombre', () => {
    const supplier = unwrap(make({ name: '  Distribuidora del Centro  ' }));
    expect(supplier.code).toBe('PRV-001');
    expect(supplier.name).toBe('Distribuidora del Centro');
  });

  it('rechaza un email con forma invalida', () => {
    expect(make({ email: 'roto' }).ok).toBe(false);
  });

  it('rechaza un identificador fiscal que no cabe', () => {
    expect(make({ taxId: 'J'.repeat(25) }).ok).toBe(false);
  });

  it('emite el evento de alta', () => {
    const supplier = unwrap(make());
    expect(supplier.pullDomainEvents()).toHaveLength(1);
  });
});

describe('Supplier — renombrar', () => {
  it('valida igual que al crear', () => {
    const supplier = unwrap(make());
    expect(supplier.rename('Distribuidora del Este').ok).toBe(true);
    expect(supplier.name).toBe('Distribuidora del Este');

    expect(supplier.rename('A').ok).toBe(false);
    expect(supplier.rename('A'.repeat(200)).ok).toBe(false);
    expect(supplier.rename('   ').ok).toBe(false);
    expect(supplier.name).toBe('Distribuidora del Este');
  });
});

describe('Supplier — el contacto se edita campo a campo', () => {
  const conContacto = () =>
    unwrap(
      make({
        taxId: 'J-12345678-9',
        email: 'ventas@distribuidora.com',
        phone: '0241-5551234',
        contactName: 'Maria Perez',
        notes: 'Entrega los martes',
      }),
    );

  it('omitir un campo lo deja como estaba', () => {
    const supplier = conContacto();

    expect(supplier.updateContact({ phone: '0241-9999999' }).ok).toBe(true);

    expect(supplier.phone).toBe('0241-9999999');
    expect(supplier.email).toBe('ventas@distribuidora.com');
    expect(supplier.contactName).toBe('Maria Perez');
    expect(supplier.notes).toBe('Entrega los martes');
    expect(supplier.taxId).toBe('J-12345678-9');
  });

  it('pasar null borra', () => {
    const supplier = conContacto();
    expect(supplier.updateContact({ notes: null, contactName: null }).ok).toBe(true);
    expect(supplier.notes).toBeNull();
    expect(supplier.contactName).toBeNull();
    expect(supplier.email).toBe('ventas@distribuidora.com');
  });

  it('normaliza el email a minusculas', () => {
    const supplier = conContacto();
    expect(supplier.updateContact({ email: '  COMPRAS@X.COM ' }).ok).toBe(true);
    expect(supplier.email).toBe('compras@x.com');
  });

  it('un email invalido no deja a medias el resto de los campos', () => {
    const supplier = conContacto();
    expect(supplier.updateContact({ email: 'roto', phone: '0000' }).ok).toBe(false);
    expect(supplier.phone).toBe('0241-5551234');
  });

  it('un identificador fiscal que no cabe tampoco', () => {
    const supplier = conContacto();
    expect(supplier.updateContact({ taxId: 'J'.repeat(25), phone: '0000' }).ok).toBe(false);
    expect(supplier.phone).toBe('0241-5551234');
    expect(supplier.taxId).toBe('J-12345678-9');
  });

  it('no toca el codigo, que lo asigna el sistema', () => {
    const supplier = conContacto();
    supplier.updateContact({ notes: 'otra cosa' });
    expect(supplier.code).toBe('PRV-001');
  });
});

describe('Supplier — archivado', () => {
  it('archiva y devuelve a la lista', () => {
    const supplier = unwrap(make());
    expect(supplier.isArchived).toBe(false);

    supplier.archive(AT);
    expect(supplier.isArchived).toBe(true);

    supplier.restore();
    expect(supplier.isArchived).toBe(false);
  });

  it('editar un proveedor archivado sigue siendo posible', () => {
    // Corregir el telefono de alguien con quien se dejo de trabajar es exactamente lo
    // que hace falta el dia que se le vuelve a llamar. Archivar oculta, no congela.
    const supplier = unwrap(make());
    supplier.archive(AT);

    expect(supplier.updateContact({ phone: '0241-1112233' }).ok).toBe(true);
    expect(supplier.phone).toBe('0241-1112233');
    expect(supplier.isArchived).toBe(true);
  });
});
