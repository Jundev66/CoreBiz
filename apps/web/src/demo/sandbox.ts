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
 * De la configuracion original solo queda el interruptor. Los limites —TTL, sandboxes
 * simultaneos, visitantes por hora— se fueron a la API, que es quien aprovisiona.
 */
export const demoConfig = {
  enabled: () => process.env.DEMO_ENABLED !== 'false',
} as const;

/*
 * Aqui vivian tambien `ttlHours`, `maxConcurrent` y `maxPerHour`. Se fueron a la API,
 * que es quien aprovisiona: tener los limites en el lado que NO los aplica es la forma
 * mas comoda de que un dia digan cosas distintas.
 *
 * `enabled` se queda porque la interfaz lo necesita para decidir si pinta la puerta. La
 * API tiene el suyo y lo comprueba tambien: con la demo apagada, el endpoint no existe
 * en lugar de existir y negarse.
 */
