import { test, expect } from '@playwright/test';
import { signIn } from '../session';

/**
 * Cabeceras de seguridad.
 *
 * Estan aqui y no en un test unitario del middleware a proposito: lo que importa
 * no es que la funcion devuelva la cadena correcta, es que la cadena LLEGUE al
 * navegador. Entre una cosa y la otra hay un `matcher`, un orden de middlewares y
 * una plataforma que puede reescribir cabeceras, y cualquiera de los tres puede
 * dejar la politica sin efecto sin que ningun test unitario se entere.
 */

const APP_ROUTES = ['/', '/customers', '/login'];

/**
 * Las pantallas de dentro exigen sesion desde que la aplicacion dejo de servir la
 * demostracion a quien no ha entrado.
 */
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.describe('Cabeceras de seguridad', () => {
  test('la CSP viaja con un nonce distinto en cada respuesta', async ({ page }) => {
    const first = await page.goto('/customers');
    const csp = first?.headers()['content-security-policy'] ?? '';

    expect(csp).toContain(`frame-ancestors 'none'`);
    expect(csp).toContain(`base-uri 'none'`);
    expect(csp).toContain(`object-src 'none'`);
    expect(csp).toContain(`form-action 'self'`);

    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce, 'la CSP tiene que llevar un nonce').toBeTruthy();

    // Un nonce fijo no es un nonce: si se reutilizara entre respuestas, un script
    // inyectado podria llevarlo escrito y la politica dejaria de servir de nada.
    const second = await page.goto('/products');
    const secondNonce = /'nonce-([^']+)'/.exec(
      second?.headers()['content-security-policy'] ?? '',
    )?.[1];

    expect(secondNonce).toBeTruthy();
    expect(secondNonce).not.toBe(nonce);
  });

  test('todo script del HTML del servidor lleva el nonce de su respuesta', async ({ page }) => {
    // Se mira el HTML CRUDO, no el DOM ya hidratado, y la diferencia es el
    // motivo de que este test existiera roto primero: con `strict-dynamic`, un
    // script cargado por otro script ya confiado hereda la confianza y NO lleva
    // nonce. Comprobarlo sobre `page.locator('script')` encuentra esos y falla
    // por una razon que no es un fallo.
    //
    // Lo que si tiene que cumplirse —y es lo que de verdad protege— es que todo
    // script que venga en la respuesta del servidor lo lleve: son los unicos que
    // el navegador evalua directamente contra la politica.
    // `page.request` y no el fixture `request`: comparte las cookies del
    // navegador, asi que la peticion llega CON sesion. Con el fixture suelto,
    // `/customers` responderia una redireccion al acceso y este test acabaria
    // comprobando el nonce de la pantalla de entrada creyendo que mira otra.
    const response = await page.request.get('/customers');
    const csp = response.headers()['content-security-policy'] ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    const html = await response.text();

    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    expect(scripts.length, 'la respuesta deberia traer scripts').toBeGreaterThan(0);

    const sinNonce = scripts.filter((tag) => !tag.includes(`nonce="${nonce ?? ''}"`));
    expect(sinNonce, sinNonce.join('\n')).toEqual([]);
  });

  test('no se dispara ninguna violacion de la politica al navegar', async ({ page }) => {
    const violations: string[] = [];

    // El navegador anuncia cada bloqueo por consola. Es la unica forma de
    // detectar una CSP demasiado estricta: la pagina se ve entera, y lo que falta
    // es el comportamiento.
    page.on('console', (message) => {
      const text = message.text();
      if (/content security policy|refused to (load|execute|apply)/i.test(text)) {
        violations.push(text);
      }
    });

    for (const route of APP_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  test('las cabeceras de endurecimiento estan puestas', async ({ page }) => {
    const response = await page.goto('/customers');
    const headers = response?.headers() ?? {};

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');

    // Se comprueba que la lista NIEGA lo que la aplicacion no usa, en lugar de
    // comparar la cadena entera: anadir una directiva nueva no deberia romper
    // este test, pero quitar una si.
    const permissions = headers['permissions-policy'] ?? '';
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment']) {
      expect(permissions).toContain(`${feature}=()`);
    }
  });

  test('las pantallas de cuenta se marcan como no indexables', async ({ page }) => {
    await page.goto('/login');

    // Aparecer en un buscador no aporta nada a un formulario de acceso y sirve
    // para que lo encuentre quien va probando puertas.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});
