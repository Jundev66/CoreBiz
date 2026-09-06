/**
 * @corebiz/application — casos de uso y puertos.
 *
 * Esta capa define QUE necesita la aplicacion del mundo exterior (los puertos) y
 * orquesta el dominio para cumplir cada caso de uso. No sabe COMO se implementa nada:
 * los adaptadores concretos viven en @corebiz/infrastructure y se inyectan en el
 * composition root de apps/web.
 */
export * from './ports/index.js';
