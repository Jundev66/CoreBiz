import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * La cookie que recuerda el sandbox de quien visita la demostracion.
 *
 * Va FIRMADA, y conviene decir contra qué protege exactamente: no contra que
 * alguien vea datos ajenos —para eso estan las politicas RLS— sino contra que
 * alguien se asigne a si mismo el sandbox de otro visitante escribiendo un
 * identificador en la cookie. Sin firma, el aislamiento entre demostraciones
 * dependeria de que nadie abriese las herramientas del navegador.
 *
 * Es HMAC-SHA256 y no un token de sesion de verdad porque no hay identidad que
 * proteger: el sandbox no tiene datos de nadie, se borra en 24 horas y su
 * contenido es el mismo para todos al empezar. Lo unico que hay que garantizar
 * es que el valor lo escribio este servidor.
 */

export const DEMO_SANDBOX_COOKIE = 'corebiz_demo_sandbox';

/** 24 horas, el mismo TTL que el sandbox. Sobrevivir al tenant no serviria. */
const MAX_AGE_SECONDS = 24 * 60 * 60;

function secret(): string {
  const value = process.env.DEMO_COOKIE_SECRET ?? '';
  // En desarrollo se admite un valor por defecto para que `pnpm dev` arranque
  // sin configurar nada. En produccion, un secreto vacio haria que la firma la
  // pudiera calcular cualquiera, asi que es mejor que no funcione a que
  // funcione mal.
  if (value === '' && process.env.NODE_ENV === 'production') {
    throw new Error('Falta DEMO_COOKIE_SECRET: la cookie del sandbox no se puede firmar.');
  }
  return value === '' ? 'corebiz-desarrollo-local' : value;
}

function sign(tenantId: string): string {
  return createHmac('sha256', secret()).update(tenantId).digest('base64url');
}

/**
 * Comprueba la firma en tiempo constante.
 *
 * `===` sobre cadenas sale antes en el primer caracter distinto, y esa
 * diferencia de tiempo es medible. Aqui el riesgo es pequeño —el valor firmado
 * es un uuid publico— pero comparar firmas con `===` es un mal habito que se
 * acaba copiando al sitio donde sí importa.
 */
function signatureMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Lee el sandbox de la cookie, o null si no hay o la firma no cuadra. */
export async function readSandboxCookie(): Promise<string | null> {
  const raw = (await cookies()).get(DEMO_SANDBOX_COOKIE)?.value;
  if (raw === undefined) return null;

  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return null;

  const tenantId = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);

  return signatureMatches(sign(tenantId), signature) ? tenantId : null;
}

export async function writeSandboxCookie(tenantId: string): Promise<void> {
  (await cookies()).set(DEMO_SANDBOX_COOKIE, `${tenantId}.${sign(tenantId)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSandboxCookie(): Promise<void> {
  (await cookies()).delete(DEMO_SANDBOX_COOKIE);
}

/** Configuracion del sandbox, con valores por defecto que caben en el plan gratuito. */
export const demoConfig = {
  enabled: () => process.env.DEMO_ENABLED !== 'false',
  ttlHours: () => positiveInt(process.env.DEMO_TTL_HOURS, 24),
  /**
   * Cincuenta sandboxes de ~20 MB son el 6 % de los 500 MB del plan gratuito.
   * El numero no es redondo por gusto: es lo que cabe dejando margen para que el
   * disyuntor de espacio actue antes de que este tope llegue a importar.
   */
  maxConcurrent: () => positiveInt(process.env.DEMO_MAX_CONCURRENT, 50),
  /**
   * Sandboxes por origen y hora. UNO por defecto.
   *
   * Cada sandbox es una copia entera de la base de demostracion, asi que el
   * limite no es avaricia: es lo que impide que una sola maquina consuma el
   * presupuesto del dia en un bucle.
   *
   * Es configurable porque hay un caso legitimo que lo necesita: la suite E2E
   * abre varios visitantes desde la MISMA maquina para comprobar que sus
   * sandboxes estan aislados entre si. Con el limite en uno, ese test no se
   * puede escribir — y es justamente el test que demuestra que la demostracion
   * hace lo que promete.
   */
  maxPerHour: () => positiveInt(process.env.DEMO_MAX_PER_HOUR, 1),
} as const;

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}
