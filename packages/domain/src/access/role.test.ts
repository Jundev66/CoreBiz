import { describe, it, expect } from 'vitest';
import {
  ROLES,
  PERMISSIONS,
  can,
  canAll,
  canWrite,
  isRole,
  permissionsOf,
  WRITE_ROLES,
  type Actor,
  type Role,
} from './role';

const actor = (role: Role): Actor => ({ userId: 'u1', role });

describe('RBAC — el propietario', () => {
  it('puede hacer absolutamente todo', () => {
    for (const permission of PERMISSIONS) {
      expect(can(actor('owner'), permission)).toBe(true);
    }
  });
});

describe('RBAC — separacion de responsabilidades', () => {
  it('un vendedor emite notas pero NO puede anularlas', () => {
    // Anular revierte stock y altera el historico: exige mas responsabilidad.
    expect(can(actor('sales'), 'delivery_note:issue')).toBe(true);
    expect(can(actor('sales'), 'delivery_note:void')).toBe(false);
  });

  it('almacen ajusta inventario pero no toca precios de venta ni clientes', () => {
    expect(can(actor('warehouse'), 'stock:adjust')).toBe(true);
    expect(can(actor('warehouse'), 'customer:write')).toBe(false);
    expect(can(actor('warehouse'), 'quote:write')).toBe(false);
  });

  it('un observador no escribe absolutamente nada', () => {
    const writePermissions = PERMISSIONS.filter(
      (p) => !p.endsWith(':read') && p !== 'report:export' && p !== 'audit:export',
    );
    for (const permission of writePermissions) {
      expect(can(actor('viewer'), permission)).toBe(false);
    }
  });

  it('solo owner y admin gestionan usuarios y ven la auditoria', () => {
    for (const role of ROLES) {
      const expected = role === 'owner' || role === 'admin';
      expect(can(actor(role), 'user:manage')).toBe(expected);
      expect(can(actor(role), 'audit:read')).toBe(expected);
    }
  });

  it('solo el propietario puede exportar la auditoria', () => {
    expect(can(actor('owner'), 'audit:export')).toBe(true);
    expect(can(actor('admin'), 'audit:export')).toBe(false);
  });
});

describe('RBAC — mecanica', () => {
  it('canAll exige todos los permisos, no solo alguno', () => {
    expect(canAll(actor('sales'), ['customer:read', 'quote:write'])).toBe(true);
    expect(canAll(actor('sales'), ['customer:read', 'delivery_note:void'])).toBe(false);
  });

  it('canWrite coincide con la lista de roles de escritura', () => {
    for (const role of ROLES) {
      expect(canWrite(role)).toBe(WRITE_ROLES.includes(role));
    }
    expect(canWrite('viewer')).toBe(false);
  });

  it('isRole rechaza cadenas que no son roles', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('superadmin')).toBe(false);
    expect(isRole('')).toBe(false);
  });
});

describe('RBAC — coherencia de la matriz', () => {
  it('todo rol declara al menos un permiso', () => {
    for (const role of ROLES) {
      expect(permissionsOf(role).length).toBeGreaterThan(0);
    }
  });

  it('no hay permisos declarados en la matriz que no existan en PERMISSIONS', () => {
    // Un permiso mal escrito en la matriz no falla: simplemente nunca concede nada,
    // y el fallo aparece meses despues como "este rol no puede hacer X". Este test
    // convierte ese error silencioso en un fallo de build.
    const valid = new Set<string>([...PERMISSIONS, '*']);
    for (const role of ROLES) {
      for (const permission of permissionsOf(role)) {
        expect(valid.has(permission), `"${permission}" en el rol "${role}" no existe`).toBe(true);
      }
    }
  });

  it('no hay permisos huerfanos, salvo los reservados al propietario a proposito', () => {
    // Exportar la auditoria entrega el historial completo del negocio en un archivo:
    // quien lo hace, cuando y sobre que. Es una accion deliberadamente reservada a quien
    // es dueno del tenant, no delegable ni siquiera a un administrador.
    const OWNER_ONLY: readonly string[] = ['audit:export'];

    const nonOwner = ROLES.filter((r) => r !== 'owner');
    for (const permission of PERMISSIONS) {
      if (OWNER_ONLY.includes(permission)) continue;
      const holders = nonOwner.filter((role) => can(actor(role), permission));
      expect(
        holders.length,
        `"${permission}" solo lo tiene el propietario: asignalo a algun rol o anadelo a OWNER_ONLY`,
      ).toBeGreaterThan(0);
    }
  });

  it('los permisos de lectura son un subconjunto de los de cada rol con escritura', () => {
    // Quien puede escribir un recurso tiene que poder leerlo. Lo contrario deja
    // formularios que guardan datos que su propio autor no puede consultar.
    for (const role of ROLES) {
      for (const permission of PERMISSIONS) {
        if (!permission.endsWith(':write')) continue;
        if (!can(actor(role), permission)) continue;
        const readPermission = permission.replace(
          ':write',
          ':read',
        ) as (typeof PERMISSIONS)[number];
        expect(can(actor(role), readPermission), `${role} escribe pero no lee ${permission}`).toBe(
          true,
        );
      }
    }
  });
});
