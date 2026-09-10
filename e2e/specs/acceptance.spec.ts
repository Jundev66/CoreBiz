import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
import { signIn, POSTGRES } from '../session';

/**
 * Aprobacion del sistema completo.
 *
 * Los escenarios BDD comprueban REGLAS —que despachar veinte quita veinte, que un
 * codigo duplicado se rechaza— y lo hacen en profundidad sobre unas pocas
 * pantallas. Este archivo comprueba lo contrario: ANCHURA. Que las veintinueve
 * rutas de la aplicacion abren, responden 200, traen su encabezado y no rompen
 * nada por el camino.
 *
 * Existe porque son dos fallos distintos y solo uno lo cazaba la suite. Una regla
 * mal implementada la encuentra un escenario; una pantalla que revienta al abrirse
 * —porque una consulta cambio de firma, o porque una traduccion falta— no la
 * encuentra nadie hasta que alguien hace clic. Y en un ERP hay muchas pantallas a
 * las que se hace clic una vez al mes.
 *
 * Lo que se vigila en cada una:
 *
 *   - Responde 200. Ni 404, ni 500, ni una redireccion al acceso.
 *   - Tiene un `h1`. Sin encabezado, un lector de pantalla no sabe donde esta.
 *   - No hay errores de consola ni excepciones sin capturar.
 *   - No se dispara ninguna violacion de la politica de seguridad de contenido.
 *
 * El ultimo importa mas de lo que parece: la CSP lleva un nonce por peticion, y una
 * politica demasiado estricta no rompe la pagina de forma visible — se ve entera y
 * lo que falta es el comportamiento.
 */

/** Rutas fijas. Las que llevan identificador se descubren mas abajo. */
const STATIC_ROUTES = [
  '/',
  '/customers',
  '/customers/new',
  '/products',
  '/products/new',
  '/delivery-notes',
  '/delivery-notes/new',
  '/purchases',
  '/purchases/new',
  '/purchases/suppliers',
  '/reports',
  '/settings',
  '/settings/team',
  '/settings/audit',
] as const;

/** Pantallas de cuenta. Se visitan SIN sesion, que es como las ve quien llega. */
const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password'] as const;

/**
 * Un identificador en la URL.
 *
 * No se exige forma de uuid: en modo memoria los identificadores son legibles a
 * proposito (`...0000000p004`), y atarlo a la forma que usa Postgres haria que este
 * test dijera que la aplicacion esta rota cuando lo que cambia es el adaptador.
 */
const ID_SEGMENT = /\/[^/]+$/;

interface Problems {
  readonly console: string[];
  readonly csp: string[];
  readonly crashes: string[];
}

/**
 * Engancha los tres canales por los que una pagina avisa de que algo va mal.
 *
 * Se hace ANTES de navegar: un `page.on` registrado despues del `goto` se pierde
 * justamente los errores del arranque, que son los que importan.
 */
function watch(page: Page): Problems {
  const problems: Problems = { console: [], csp: [], crashes: [] };

  page.on('console', (message: ConsoleMessage) => {
    const text = message.text();
    if (/content security policy|refused to (load|execute|apply)/i.test(text)) {
      problems.csp.push(text);
      return;
    }
    if (message.type() === 'error') problems.console.push(text);
  });

  page.on('pageerror', (error) => problems.crashes.push(error.message));

  return problems;
}

function report(route: string, problems: Problems): string {
  return [
    `Ruta: ${route}`,
    problems.crashes.length > 0 ? `Excepciones: ${problems.crashes.join(' | ')}` : '',
    problems.csp.length > 0 ? `CSP: ${problems.csp.join(' | ')}` : '',
    problems.console.length > 0 ? `Consola: ${problems.console.join(' | ')}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

async function check(page: Page, route: string): Promise<void> {
  const problems = watch(page);

  const response = await page.goto(route);
  expect(response?.status(), `${route} deberia responder 200`).toBe(200);

  // La URL final tiene que ser la pedida. Una redireccion silenciosa al acceso es
  // el fallo mas facil de pasar por alto: la pagina carga, se ve bien, y no es la
  // que se pidio.
  expect(new URL(page.url()).pathname, `${route} no deberia redirigir`).toBe(route);

  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.waitForLoadState('networkidle');

  expect(problems.crashes, report(route, problems)).toEqual([]);
  expect(problems.csp, report(route, problems)).toEqual([]);
  expect(problems.console, report(route, problems)).toEqual([]);
}

test.describe('Aprobacion del sistema', () => {
  test.describe('Pantallas publicas', () => {
    for (const route of PUBLIC_ROUTES) {
      test(`${route} abre sin sesion`, async ({ page }) => {
        await check(page, route);
      });
    }
  });

  /**
   * `/demo` se comprueba aparte porque hace dos cosas distintas segun el adaptador,
   * y las dos son correctas: contra Postgres entrega credenciales, y en memoria
   * lleva directo a la aplicacion, que YA es la demostracion. Meterlo en la lista de
   * arriba habria obligado a elegir cual de los dos comportamientos es "el bueno".
   */
  test('/demo lleva a la demostracion, de la forma que corresponda al adaptador', async ({
    page,
  }) => {
    const problems = watch(page);
    const response = await page.goto('/demo');

    expect(response?.status()).toBe(200);

    if (POSTGRES) {
      expect(new URL(page.url()).pathname).toBe('/demo');
      await expect(page.getByRole('button', { name: /demo|demostración/i })).toBeVisible();
    } else {
      expect(new URL(page.url()).pathname).toBe('/customers');
    }

    expect(problems.crashes, report('/demo', problems)).toEqual([]);
    expect(problems.csp, report('/demo', problems)).toEqual([]);
  });

  test.describe('Pantallas de dentro', () => {
    // Aqui se sembraba una cookie de plan PRO para que compras y reportes sirvieran
    // su contenido en lugar del aviso de modulo bloqueado. Ya no hay planes ni aviso:
    // todas las pantallas sirven lo suyo con entrar.
    test.beforeEach(async ({ page }) => {
      await signIn(page);
    });

    for (const route of STATIC_ROUTES) {
      test(`${route} abre con sesion`, async ({ page }) => {
        await check(page, route);
      });
    }

    /**
     * Las rutas con identificador.
     *
     * Los identificadores se DESCUBREN navegando, no se codifican: escribirlos aqui
     * ataria el test a la semilla, y la semilla cambia. Ademas, si un enlace de un
     * listado dejara de existir, este test fallaria por el motivo correcto.
     */
    test('las fichas y los documentos abren desde sus listados', async ({ page }) => {
      const problems = watch(page);

      // Ficha de cliente. El enlace se busca DENTRO de la tabla: fuera hay un
      // "Ver también los archivados" que tambien empieza por "Ver", y el selector
      // sin acotar se lo llevaba por delante.
      await page.goto('/customers');
      await page
        .getByRole('table')
        .getByRole('link', { name: /view|ver/i })
        .first()
        .click();
      await expect(page).toHaveURL(new RegExp(`/customers${ID_SEGMENT.source}`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      // Ficha de producto, con su libro de movimientos.
      await page.goto('/products');
      await page
        .getByRole('table')
        .getByRole('link', { name: /view|ver/i })
        .first()
        .click();
      await expect(page).toHaveURL(new RegExp(`/products${ID_SEGMENT.source}`));
      await expect(
        page.getByRole('heading', { name: /stock movements|movimientos de inventario/i }),
      ).toBeVisible();

      // Nota de entrega y su version imprimible.
      await page.goto('/delivery-notes');
      await page.getByRole('link', { name: /^NE-/ }).first().click();
      await expect(page).toHaveURL(new RegExp(`/delivery-notes${ID_SEGMENT.source}`));

      await page.getByRole('link', { name: /print|imprimir/i }).click();
      await expect(page).toHaveURL(/\/print$/);
      // El documento impreso NO lleva el marco de la aplicacion: lo que sale por la
      // impresora tiene que ser el papel, no una captura de la pantalla.
      await expect(page.getByRole('navigation')).toHaveCount(0);
      await expect(page.getByText(/sin valor fiscal|no fiscal value/i)).toBeVisible();

      expect(problems.crashes, report('fichas y documentos', problems)).toEqual([]);
      expect(problems.csp, report('fichas y documentos', problems)).toEqual([]);
    });

    /**
     * Una recepcion, que solo existe si alguien la registro.
     *
     * En la semilla no hay ninguna, asi que este test la crea. Es la unica ruta que
     * no se puede alcanzar sin escribir antes.
     */
    test('el detalle de una recepcion abre desde su listado', async ({ page }) => {
      test.skip(!POSTGRES, 'la recepcion se registra contra la base de datos');

      const problems = watch(page);

      await page.goto('/purchases');
      const existing = await page.getByRole('link', { name: /^RM-/ }).count();

      if (existing === 0) {
        await page.goto('/purchases/new');
        await selectFirstReal(page, '#supplierId');
        await selectFirstReal(page, 'select[name="productId"]');
        await page.locator('input[name="quantity"]').first().fill('1');
        await page.locator('input[name="unitCost"]').first().fill('1.00');
        await page.getByRole('button', { name: /record the delivery|registrar/i }).click();

        // Se espera a la NAVEGACION, no al aviso flotante.
        //
        // Aqui habia `main >> role=status`, y no podia funcionar: el aviso de "listo"
        // lo pinta el marco por encima de todo, fuera de `<main>`, y ahi dentro no hay
        // ningun `role=status`. No se veia porque esta rama solo se ejecuta con la base
        // recien sembrada —sin recepciones que reutilizar— y esa es justo la ruta que
        // toma `pnpm approve`, que nadie habia corrido.
        await page.waitForURL(/\/purchases(\?|$)/);
      }

      await page.getByRole('link', { name: /^RM-/ }).first().click();
      await expect(page).toHaveURL(new RegExp(`/purchases${ID_SEGMENT.source}`));
      await expect(page.getByRole('heading', { level: 1, name: /^RM-/ })).toBeVisible();

      expect(problems.crashes, report('detalle de recepcion', problems)).toEqual([]);
      expect(problems.csp, report('detalle de recepcion', problems)).toEqual([]);
    });
  });
});

/**
 * Elige la primera opcion real de un desplegable, saltandose el marcador vacio.
 *
 * Se leen los atributos desde Playwright en lugar de evaluar codigo en el navegador:
 * el `tsconfig` de la suite no incluye los tipos del DOM a proposito —estos tests no
 * son codigo de navegador— y meterlos para una linea seria abrir la puerta a que
 * empiecen a colarse.
 */
async function selectFirstReal(page: Page, selector: string): Promise<void> {
  const select = page.locator(selector).first();
  const options = await select.locator('option').all();

  for (const option of options) {
    const value = await option.getAttribute('value');
    if (value !== null && value !== '') {
      await select.selectOption(value);
      return;
    }
  }

  throw new Error(`${selector} no trae ninguna opcion seleccionable`);
}
