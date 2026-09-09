import { defineConfig } from 'prisma/config';

/**
 * Configuracion del CLI de Prisma.
 *
 * Desde Prisma 7 la URL ya no vive en `schema.prisma`: el esquema describe la forma de
 * los datos y la conexion se declara aqui. Es una separacion util — el esquema se
 * commitea y la credencial no.
 *
 * Solo la usan los comandos del CLI (`db pull`, `generate`, `studio`). El cliente en
 * ejecucion NO pasa por aqui: recibe un adaptador ya conectado, que es lo que permite
 * que no haga falta el motor en Rust.
 *
 * Se apunta a `DIRECT_URL` y no a `DATABASE_URL` cuando existe: introspeccionar a traves
 * del pooler en modo transaccion da resultados incompletos, porque las consultas al
 * catalogo del sistema necesitan la sesion entera.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
