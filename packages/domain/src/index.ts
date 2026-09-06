/**
 * @corebiz/domain — el nucleo hexagonal.
 *
 * Este paquete no tiene NI UNA dependencia (mira su package.json). No conoce Next.js,
 * ni Supabase, ni el ORM, ni siquiera que existe una base de datos. Solo reglas de
 * negocio y tipos. La regla `domain-is-pure` de .dependency-cruiser.cjs lo verifica
 * en cada build.
 */
export * from './shared/index';
export * from './access/index';
export * from './billing/index';
export * from './customers/index';
export * from './products/index';
export * from './sales/index';
