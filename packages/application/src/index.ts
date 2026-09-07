/**
 * @corebiz/application — casos de uso y puertos.
 *
 * Define QUE necesita la aplicacion del mundo exterior (los puertos) y orquesta el
 * dominio para cumplir cada caso de uso. No sabe COMO se implementa nada: los
 * adaptadores concretos viven en @corebiz/infrastructure y se inyectan en el
 * composition root de apps/web.
 */
export * from './ports/index';
export * from './queries/index';
export * from './adapters/memory/index';
export * from './use-cases/customers/create-customer';
export * from './use-cases/sales/issue-delivery-note';
export * from './use-cases/sales/void-delivery-note';
export * from './use-cases/products/create-product';
export * from './use-cases/products/adjust-stock';
export * from './use-cases/administration/invite-user';
export * from './use-cases/administration/manage-team';
export * from './use-cases/administration/update-tenant-settings';
