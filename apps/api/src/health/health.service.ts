import { Injectable } from '@nestjs/common';
import { databaseIsReachable } from '@corebiz/infrastructure';
import { loadEnv } from '../config/env';

export interface HealthReport {
  readonly status: 'ok' | 'degraded';
  readonly driver: 'postgres' | 'memory';
  readonly database: 'reachable' | 'unreachable' | 'not-applicable';
}

/**
 * Comprobacion de salud que TOCA la base de datos.
 *
 * Un health que solo responde "el proceso vive" es peor que ninguno: pasa en verde
 * mientras la aplicacion no puede servir una sola pantalla. Render usa este endpoint
 * para decidir si un despliegue sale adelante, y el keepalive lo usa para que
 * Supabase no pause el proyecto por inactividad — las dos cosas necesitan que la
 * consulta llegue hasta Postgres.
 */
@Injectable()
export class HealthService {
  async check(): Promise<HealthReport> {
    const env = loadEnv();

    if (env.DATA_DRIVER === 'memory') {
      return { status: 'ok', driver: 'memory', database: 'not-applicable' };
    }

    const reachable = await databaseIsReachable(env.DATABASE_URL ?? '');
    return {
      status: reachable ? 'ok' : 'degraded',
      driver: 'postgres',
      database: reachable ? 'reachable' : 'unreachable',
    };
  }
}
