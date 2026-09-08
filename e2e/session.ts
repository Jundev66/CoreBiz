import { expect, type Page } from '@playwright/test';

/**
 * Iniciar sesion, para todo lo que corre contra Postgres.
 *
 * Existe desde que la aplicacion dejo de servir la demostracion SIN sesion. Esa
 * rama anonima hacia que cualquier `goto('/customers')` funcionara sin mas, y
 * quitarla es lo mejor que se le ha hecho al composition root: ya no queda
 * codigo que decida a que empresa entra alguien sin haber verificado quien es.
 * El precio es este archivo, y esta bien pagado.
 *
 * Lo usan los pasos BDD y los specs por igual. Estaba duplicado en los dos
 * sitios y duro exactamente una tarde: la segunda copia se quedo sin el
 * reintento de abajo y la mitad de la suite empezo a fallar por turnos.
 */

export const POSTGRES = process.env.E2E_DRIVER === 'postgres';

/** La cuenta que siembra `supabase/seed.sql`, duena del tenant de demostracion. */
const SEEDED_OWNER = { email: 'demo@corebiz.local', password: 'corebiz-demo' } as const;

/**
 * Deja la pagina con una sesion de propietario iniciada.
 *
 * En modo memoria no hace nada: no hay autenticacion que iniciar, y la
 * aplicacion entera es la demostracion. Que el mismo paso Gherkin signifique
 * "entra de verdad" contra Postgres y "no hay nada que hacer" en memoria es
 * justamente lo que permite que los mismos escenarios corran sobre los dos
 * adaptadores sin tocar una linea de `.feature`.
 *
 * Hay dos esperas y las dos costaron una corrida entera de la suite:
 *
 *   `waitForURL` despues de pulsar. Sin ella, el `goto` de abajo sale mientras
 *   el POST de la Server Action sigue en vuelo, lo CANCELA, y la cookie de
 *   sesion no llega nunca. El sintoma es desconcertante —el formulario no
 *   muestra ningun error y aun asi no hay sesion— y no se parece en nada a su
 *   causa.
 *
 *   Y la comprobacion contra `/customers`. Salir del formulario no prueba nada:
 *   una cookie escrita y un `getUser()` que falla se ven exactamente igual desde
 *   aqui hasta que se pide una pantalla que exige sesion.
 *
 * El reintento tampoco es paranoia. `pnpm test:e2e:pg` hace `supabase db reset`,
 * que REINICIA los contenedores, y Playwright solo espera a que responda la
 * aplicacion — no GoTrue, que va en otro. Los primeros accesos de la corrida
 * llegan cuando el servicio de autenticacion todavia esta levantandose.
 */
export async function signIn(page: Page): Promise<void> {
  if (!POSTGRES) return;

  await expect(async () => {
    await page.goto('/login');
    await page.getByLabel(/correo|email/i).fill(SEEDED_OWNER.email);
    await page.getByLabel(/contraseña|password/i).fill(SEEDED_OWNER.password);
    await page.getByRole('button', { name: /entrar|sign in/i }).click();

    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });

    await page.goto('/customers');
    await expect(page).not.toHaveURL(/\/login/);
  }).toPass({ timeout: 25_000, intervals: [300, 1_000, 2_000] });
}
