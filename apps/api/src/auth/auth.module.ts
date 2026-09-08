import { Module } from '@nestjs/common';
import { JWT_VERIFIER } from '../tokens';
import { SupabaseJwtVerifier } from './supabase-jwt.verifier';
import { activeDriver } from '../composition/driver';

/**
 * El verificador de tokens se construye PEREZOSAMENTE.
 *
 * En modo memoria no hay Supabase, y exigir `SUPABASE_URL` para arrancar romperia
 * `pnpm dev:nodb` y la mitad de la suite E2E — que corren sin credenciales a
 * proposito, porque esa es la prueba de que la arquitectura hexagonal es real.
 */
@Module({
  providers: [
    {
      provide: JWT_VERIFIER,
      useFactory: () => (activeDriver() === 'memory' ? null : new SupabaseJwtVerifier()),
    },
  ],
  exports: [JWT_VERIFIER],
})
export class AuthModule {}
