import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RATE_LIMITS } from '@corebiz/application';
import {
  countRecentDemoSandboxes,
  postgresRateLimiter,
  provisionDemoSandbox,
} from '@corebiz/infrastructure';
import { InternalSecretGuard } from '../../auth/internal-secret.guard';
import { loadEnv } from '../../config/env';
import { activeDriver, databaseUrl } from '../../config/driver';
import { domainError } from '../../http/api-error';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';

/** La plantilla que se clona. Nadie la opera: cada visitante recibe una COPIA. */
const DEMO_TEMPLATE_TENANT_ID = '00000000-0000-4000-8000-000000000001';

const startDemoSchema = z
  .object({
    /**
     * El origen, YA HASHEADO por la web.
     *
     * La direccion IP no cruza esta frontera. Se hashea donde `x-forwarded-for` es de
     * fiar —lo pone Vercel, no el cliente— y aqui solo llega un rastro anonimo con el
     * que contar intentos.
     */
    ipHash: z.string().trim().min(1).max(160).nullable(),
  })
  .strict();

/**
 * Lo que se le entrega al visitante.
 *
 * NO viajan el `tenantId` ni el `userId` que devuelve el adaptador: la web no los
 * necesita —entra con las credenciales como todo el mundo— y publicar identificadores
 * internos en una respuesta sin autenticar es superficie regalada.
 *
 * Las horas que quedan y no la fecha absoluta: quien acaba de entrar quiere saber
 * cuanto le dura, no a que hora exacta se convierte en calabaza.
 */
export interface DemoCredentials {
  readonly email: string;
  readonly password: string;
  readonly hoursLeft: number;
  readonly readonly: boolean;
  /** Why the seat is read-only: `busy` (capacity) or `limit` (hourly copy quota). */
  readonly readonlyReason: 'busy' | 'limit' | null;
}

/**
 * La puerta de la demostracion.
 *
 * It carries no USER session, and cannot: it exists precisely to hand credentials to
 * someone who has none yet.
 *
 * It does carry a credential, though. `InternalSecretGuard` requires the secret shared by
 * both deployments, like the internal endpoints, because the caller is always `apps/web`
 * and never a browser.
 *
 * It was needed, and the reason deserves to stay written: the quotas below count by
 * `ipHash`, a value that arrives IN THE BODY. That is trustworthy when Vercel computes it —
 * the platform sets `x-forwarded-for` there — but the API has its own public URL, so without a
 * credential anyone could call it directly, rotate that value on every request and skip
 * the per-origin quota entirely. Provisioning in bursts means GoTrue accounts and database
 * copies: an attack on the free quota, the asset the threat model ranks first.
 *
 * Es POST y nunca un GET, y esa es la otra decision que protege el presupuesto: un GET
 * que provisiona lo dispara cualquier rastreador, cualquier previsualizacion de enlace
 * de un chat y cualquier antivirus de correo. Publicar el enlace en una red social
 * crearia decenas de cuentas y de copias de la base antes de que lo abriese una
 * persona.
 */
@ApiTags('demostracion')
@UseGuards(InternalSecretGuard)
@Controller('v1/demo')
export class DemoController {
  @Post('sandboxes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Entregar credenciales propias a un visitante' })
  async start(
    @Body(new ZodValidationPipe(startDemoSchema)) body: z.infer<typeof startDemoSchema>,
  ): Promise<DemoCredentials> {
    const env = loadEnv();

    // La misma variable que cierra la puerta en el resto del sistema. Con la demo
    // apagada este endpoint no existe, en lugar de existir y negarse.
    if (!env.DEMO_ENABLED) throw new NotFoundException();

    if (activeDriver() === 'memory') {
      throw domainError('Unavailable');
    }

    const url = databaseUrl();
    const hour = RATE_LIMITS.demoSandbox.windowSeconds;

    /*
     * The quota counts COPIES that exist, not clicks.
     *
     * It used to record a hit before anything was created, failures included, with a limit of
     * one: a single test from an office network left every recruiter behind that address
     * facing "you already created a demo" — about a demo they never had. Now an origin gets
     * its own copies up to `DEMO_MAX_PER_HOUR`, everyone together up to
     * `DEMO_MAX_SANDBOXES_PER_HOUR`, and past either the visitor still gets in, read-only.
     */
    const [fromOrigin, overall] = await Promise.all([
      countRecentDemoSandboxes(url, { ipHash: body.ipHash, sinceSeconds: hour }),
      countRecentDemoSandboxes(url, { sinceSeconds: hour }),
    ]);
    const quotaReached =
      fromOrigin >= env.DEMO_MAX_PER_HOUR || overall >= env.DEMO_MAX_SANDBOXES_PER_HOUR;

    if (quotaReached) {
      // Read-only seats are cheap but not free (an account, an identity, a session), so an
      // origin gets a bounded number of them. Only past that is the visitor told to wait.
      const decision = await postgresRateLimiter(url).hit(
        `demoViewer:${body.ipHash ?? 'anonimo'}`,
        RATE_LIMITS.demoViewer.limit,
        RATE_LIMITS.demoViewer.windowSeconds,
      );
      if (!decision.allowed) {
        throw domainError('TooManyAttempts', { retryAfter: decision.retryAfterSeconds ?? 0 });
      }
    }

    const result = await provisionDemoSandbox(url, {
      templateTenantId: DEMO_TEMPLATE_TENANT_ID,
      ipHash: body.ipHash,
      ttlHours: env.DEMO_TTL_HOURS,
      maxConcurrent: env.DEMO_MAX_CONCURRENT,
      maxReadonlyPerHour: env.DEMO_MAX_READONLY_PER_HOUR,
      forceReadonly: quotaReached,
    });

    if (!result.ok) throw domainError('Unavailable');

    return {
      email: result.email,
      password: result.password,
      hoursLeft: env.DEMO_TTL_HOURS,
      /*
       * En modo degradado el visitante entra en SOLO LECTURA sobre la plantilla
       * compartida, en lugar de recibir un "vuelve mas tarde". Devolver eso en el
       * enlace de un curriculum es el peor resultado posible del proyecto entero,
       * porque el momento en que se abre es justo el que no se repite.
       */
      readonly: result.readonly,
      readonlyReason:
        result.readonlyReason === 'capacity'
          ? 'busy'
          : result.readonlyReason === 'limit'
            ? 'limit'
            : null,
    };
  }
}
