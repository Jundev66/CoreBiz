/**
 * Implementaciones de referencia de los puertos, en memoria.
 *
 * Viven junto a los puertos —y no en `infrastructure`— por una razon concreta: no
 * hacen IO. No abren conexiones, no leen archivos, no dependen de nada externo. Son
 * dobles: documentacion ejecutable del contrato que cada puerto promete, y la unica
 * forma de testear un caso de uso en milisegundos.
 *
 * Ademas alimentan el driver en memoria, que arranca la aplicacion completa sin base de
 * datos. Los adaptadores que SI hacen IO (Postgres, Supabase) viven donde deben:
 * en @corebiz/infrastructure.
 */
export * from './repositories';
export * from './sales';
export { inMemoryReadModels } from './queries';
export * from './administration';
export * from './purchasing';
