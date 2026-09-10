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
export * from './use-cases/customers/set-customer-status';
export * from './use-cases/customers/update-customer';
export * from './use-cases/sales/issue-delivery-note';
export * from './use-cases/sales/mark-delivered';
export * from './use-cases/sales/void-delivery-note';
export * from './use-cases/products/create-product';
export * from './use-cases/products/update-product';
export * from './use-cases/products/adjust-stock';
export * from './use-cases/products/set-product-status';
export * from './use-cases/administration/invite-user';
export * from './use-cases/administration/manage-team';
export * from './use-cases/administration/update-tenant-settings';
export * from './use-cases/purchasing/create-supplier';
export * from './use-cases/purchasing/update-supplier';
export * from './use-cases/purchasing/set-supplier-status';
export * from './use-cases/purchasing/receive-goods';
export * from './use-cases/purchasing/void-goods-receipt';
