import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { inMemoryRateLimiter, type RateLimiter } from '@corebiz/application';
import { postgresRateLimiter } from '@corebiz/infrastructure';
import { activeDriver, databaseUrl } from '../config/driver';
import { loadEnv } from '../config/env';
import { domainError } from '../http/api-error';

/** One minute, like `ReadThrottleGuard`: a ceiling on volume, not on attempts. */
const WINDOW_SECONDS = 60;

interface IntegrationRequest {
  readonly method: string;
  readonly url: string;
  readonly originalUrl?: string;
  readonly ip?: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly socket?: { readonly remoteAddress?: string };
}

/**
 * Limite de volumen y bitacora de acceso para la integracion externa (`/v1/integrations/*`).
 *
 * `ReadThrottleGuard` no cubre estas rutas: se salta en cuanto `req.auth === undefined`, y
 * la integracion no tiene sesion de usuario —por eso queda FUERA de `AuthMiddleware`—. Sin
 * este guard, una maquina con la clave valida podia leer en bucle y ocupar una de las tres
 * conexiones del pool indefinidamente, poniendo en cola a todas las empresas.
 *
 * Se ejecuta DESPUES de `IntegrationsApiKeyGuard` (orden de `@UseGuards`), asi que solo
 * cuenta y registra accesos ya autenticados. Una clave incorrecta no llega aqui: se corta
 * en 401 antes de tocar el limitador, y un atacante no puede agotar el cupo del cliente
 * legitimo. La clave JAMAS se registra: la bitacora guarda solo su huella (SHA-256).
 *
 * El contador es el mismo que el de escrituras: Postgres en produccion, para que todas las
 * instancias compartan un contador; en memoria solo cuando el driver es memoria, donde hay
 * un unico proceso por definicion.
 */
@Injectable()
export class IntegrationsThrottleGuard implements CanActivate {
  private readonly logger = new Logger(IntegrationsThrottleGuard.name);
  private memoryLimiter: RateLimiter | null = null;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const req = context.switchToHttp().getRequest<IntegrationRequest>();
    const fingerprint = keyFingerprint(req.headers.authorization);
    const access = `integracion method=${req.method} path=${req.originalUrl ?? req.url} key=${fingerprint} ip=${clientIp(req)}`;

    const decision = await this.limiter().hit(
      `integrations:${fingerprint}`,
      loadEnv().INTEGRATIONS_REQUESTS_PER_MINUTE,
      WINDOW_SECONDS,
    );

    if (decision.allowed) {
      this.logger.log(`${access} -> ok`);
      return true;
    }

    this.logger.warn(`${access} -> 429 retryAfter=${decision.retryAfterSeconds}s`);
    throw domainError('TooManyAttempts', { retryAfter: decision.retryAfterSeconds });
  }

  private limiter(): RateLimiter {
    if (activeDriver() !== 'memory') return postgresRateLimiter(databaseUrl());
    this.memoryLimiter ??= inMemoryRateLimiter();
    return this.memoryLimiter;
  }
}

/**
 * Huella del credential, nunca el credential.
 *
 * La cabecera ya paso por `IntegrationsApiKeyGuard`, asi que aqui es una clave valida. Se
 * hashea para que la bitacora no guarde el secreto y para que dos despliegues con claves
 * distintas no compartan el mismo cubo de forma trivial.
 */
function keyFingerprint(authorization: string | string[] | undefined): string {
  const header = typeof authorization === 'string' ? authorization : '';
  const material = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
  if (material === '') return 'anonimo';
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}

function clientIp(req: IntegrationRequest): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'desconocida';
}
