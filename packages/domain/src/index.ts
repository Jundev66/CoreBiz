/**
 * @corebiz/domain — el nucleo hexagonal.
 *
 * Este paquete no tiene NI UNA dependencia (mira su package.json). No conoce Next.js,
 * ni Supabase, ni el ORM, ni siquiera que existe una base de datos. Solo reglas de
 * negocio y tipos. La regla `domain-is-pure` de .dependency-cruiser.cjs lo verifica
 * en cada build.
 */
export * from './shared/index.js';
export * from './customers/index.js';
export * from './access/index.js';
export * from './billing/index.js';
