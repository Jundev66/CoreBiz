import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { z } from 'zod';
import { inMemoryRateLimiter, type RateLimitDecision } from '@corebiz/application';
import { postgresRateLimiter, purgeExpiredDemos } from '@corebiz/infrastructure';
import { InternalSecretGuard } from '../../auth/internal-secret.guard';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { activeDriver, databaseUrl } from '../../config/driver';

const rateLimitSchema = z
  .object({
    /** Ya viene hasheado. La IP en claro NO cruza esta frontera. */
    bucket: z.string().trim().min(1).max(160),
    limit: z.number().int().min(1).max(10_000),
    windowSeconds: z.number().int().min(1).max(86_400),
  })
  .strict();

/**
 * Endpoints que solo usa `apps/web`, desde el servidor.
 *
 * `@ApiExcludeController` los deja fuera de la documentacion: no forman parte del
 * contrato publico de la API y publicar su existencia no ayuda a nadie salvo a quien
 * busca donde apretar.
 */
@ApiExcludeController()
@UseGuards(InternalSecretGuard)
@Controller('internal')
export class InternalController {
  /**
   * Limitacion de intentos.
   *
   * El contador vive aqui porque necesita Postgres —una ventana compartida entre
   * instancias— pero el HASH lo calcula la web, que es el unico sitio donde
   * `x-forwarded-for` es de fiar: lo pone Vercel y no el cliente. Lo que cruza es solo
   * el bucket ya hasheado; la direccion nunca sale de la funcion que la recibio.
   */
  @Post('rate-limits')
  hit(
    @Body(new ZodValidationPipe(rateLimitSchema)) body: z.infer<typeof rateLimitSchema>,
  ): Promise<RateLimitDecision> {
    const limiter =
      activeDriver() === 'memory' ? inMemoryRateLimiter() : postgresRateLimiter(databaseUrl());

    return limiter.hit(body.bucket, body.limit, body.windowSeconds);
  }

  /**
   * Purga de sandboxes caducados.
   *
   * Es un RESPALDO. La purga de verdad corre cada diez minutos dentro de Postgres con
   * `pg_cron`, donde no depende de que este servicio este despierto — y en el plan
   * gratuito de Render eso pasa quince minutos despues de la ultima visita.
   */
  @Post('cron/purge')
  async purge(): Promise<{ purged: number }> {
    if (activeDriver() === 'memory') return { purged: 0 };
    return { purged: await purgeExpiredDemos(databaseUrl()) };
  }
}
