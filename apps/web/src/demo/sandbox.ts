import 'server-only';

/**
 * Configuracion del sandbox de demostracion.
 *
 * Aqui vivia tambien una cookie firmada con HMAC que decia a que sandbox
 * pertenecia cada visitante. Ya no hace falta y merece explicarse por que, para
 * que a nadie le tiente reponerla: cada visitante recibe ahora CREDENCIALES
 * PROPIAS y entra con una sesion de verdad, asi que quien es lo dice el token de
 * Supabase y a que empresa pertenece lo dice la tabla `memberships` con RLS
 * encima. Firmar una cookie era la forma de sostener una identidad que no
 * existia; con identidad de verdad, sobra.
 *
 * Los valores por defecto estan elegidos para que todo quepa en el plan gratuito
 * sin vigilarlo a mano.
 */
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
   * Cada sandbox es una copia entera de la base de demostracion mas una cuenta
   * nueva, asi que el limite no es avaricia: es lo que impide que una sola
   * maquina consuma el presupuesto del dia en un bucle.
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
