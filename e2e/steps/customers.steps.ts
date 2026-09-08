import { expect } from '@playwright/test';
import { Given, When, Then, setDemoCookies, signIn } from './fixtures';

/**
 * Definiciones de paso del modulo de clientes.
 *
 * Los pasos hablan el idioma del negocio; los selectores y las esperas viven aqui
 * dentro. Si manana cambia el marcado de la tabla, se toca este archivo y ninguna
 * `.feature`: ese es todo el punto de separar la especificacion de su implementacion.
 */

Given('I am signed in as an owner', async ({ page }) => {
  // El idioma y el rol van por cookie ANTES de entrar: la pantalla de acceso ya
  // tiene que salir en el idioma del escenario, y el rol solo se obedece dentro
  // de un tenant marcado `is_demo`, que es donde entra esta cuenta.
  await setDemoCookies(page, { role: 'owner', plan: 'free', locale: 'en' });
  await signIn(page);
});

Given('the business is on the paid plan', async ({ page }) => {
  await setDemoCookies(page, { plan: 'pro' });
});

When('I open the customers page', async ({ page }) => {
  await page.goto('/customers');
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
});

When('I open the new customer form', async ({ page }) => {
  await page.goto('/customers/new');
  await expect(page.getByRole('heading', { name: 'New customer' })).toBeVisible();
});

When('I fill in the customer name with {string}', async ({ page }, name: string) => {
  await page.getByLabel('Name', { exact: false }).fill(name);
});

When('I submit the customer form', async ({ page }) => {
  await page.getByRole('button', { name: 'Save' }).click();
});

Then('I should see the customer {string}', async ({ page }, name: string) => {
  // `.first()`: la suite corre varias veces contra la misma base sin reiniciarla, y
  // un escenario que da de alta por nombre puede haber dejado dos. Lo que se
  // comprueba es que APAREZCA, no cuantas veces.
  await expect(page.getByRole('cell', { name }).first()).toBeVisible();
});

Then('I should see a success confirmation', async ({ page }) => {
  // `role=status` en lugar de un selector de clase: si el aviso no es anunciable por un
  // lector de pantalla, el test debe fallar igual que si no se viese.
  await expect(page.locator('form').getByRole('status')).toContainText(/created/i);
});

Then('the confirmation shows the code the system assigned', async ({ page }) => {
  // Es la comprobacion que sustituye a la del codigo duplicado. Lo que hay que
  // garantizar ya no es que se rechace un codigo repetido —no puede haberlo— sino
  // que a quien acaba de dar de alta se le DIGA cual le tocó. Un codigo que existe
  // y no se ve obliga a ir a buscarlo al listado.
  await expect(page.locator('form').getByRole('status')).toContainText(/CLT\d{8}/);
});

/**
 * Un nombre distinto en cada corrida.
 *
 * La base no se reinicia entre ejecuciones en memoria, asi que un nombre fijo deja
 * residuo: a la segunda vuelta hay un cliente archivado y otro vivo llamados igual,
 * y el escenario deja de comprobar nada.
 */
When('I register a customer just for this scenario', async ({ page, world }) => {
  world.lastCode = `Comercial De Paso ${Date.now().toString().slice(-6)}`;

  await page.goto('/customers/new');
  await page.getByLabel('Name', { exact: false }).fill(world.lastCode);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('form').getByRole('status')).toBeVisible();
});

When('I open its details', async ({ page, world }) => {
  const name = world.lastCode ?? '';
  await page.goto('/customers');

  const row = page.getByRole('row').filter({ hasText: name });
  await row.getByRole('link', { name: /view|ver/i }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
});

When('I archive the customer', async ({ page }) => {
  await page.getByRole('button', { name: /^archive$|^archivar$/i }).click();
});

Then('the customer shows as archived', async ({ page }) => {
  // El aviso explicito, y no la etiqueta de estado: dice ADEMAS que sus documentos
  // anteriores siguen intactos, que es la mitad de la promesa de archivar en vez de
  // borrar. Acotado a `main` porque el marco pinta su propio `role="status"`.
  await expect(page.locator('main').getByRole('status')).toContainText(/archived|archivado/i);
});

Then('I should not see that customer', async ({ page, world }) => {
  await expect(page.getByRole('cell', { name: world.lastCode ?? '' })).toHaveCount(0);
});

Then('I should see that customer', async ({ page, world }) => {
  await expect(page.getByRole('cell', { name: world.lastCode ?? '' })).toBeVisible();
});

When('I show the archived customers', async ({ page }) => {
  await page.goto('/customers?archivados=1');
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
});

Then('I should see a validation error on the name field', async ({ page }) => {
  const field = page.getByLabel('Name', { exact: false });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
});

Then('I should see the customer quota for the free plan', async ({ page }) => {
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '50');
});

Then('I should see the customer quota for the paid plan', async ({ page }) => {
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '5000');
});
