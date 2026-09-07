import { defineConfig } from 'drizzle-kit';

/**
 * Configuracion de drizzle-kit.
 *
 * IMPORTANTE: aqui NO se generan migraciones. La fuente de verdad del esquema es
 * el SQL de `supabase/migrations/`, porque lleva politicas RLS, funciones
 * SECURITY DEFINER, triggers e indices parciales que drizzle-kit no expresa. Si
 * ademas se generaran migraciones desde el esquema TypeScript habria dos
 * historias de cambios compitiendo, y tarde o temprano una pisaria a la otra.
 *
 * El esquema de `src/schema/` es el ESPEJO tipado de ese SQL, y un test de
 * integracion comprueba que ambos siguen diciendo lo mismo.
 *
 * Esto existe solo para `drizzle-kit studio`, que sirve para mirar los datos
 * durante el desarrollo. Por eso apunta a la conexion DIRECTA (5432 en la nube,
 * 54322 en local) y no al pooler.
 */
export default defineConfig({
  schema: './src/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DIRECT_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  },
});
