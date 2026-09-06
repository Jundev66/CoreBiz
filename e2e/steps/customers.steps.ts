import { expect } from '@playwright/test';
import { Given, When, Then, setDemoCookies } from './fixtures';

/**
 * Definiciones de paso del modulo de clientes.
 *
 * Los pasos hablan el idioma del negocio; los selectores y las esperas viven aqui
 * dentro. Si manana cambia el marcado de la tabla, se toca este archivo y ninguna
 * `.feature`: ese es todo el punto de separar la especificacion de su implementacion.
 */

Given('I am signed in as an owner', async ({ page }) => {
  await setDemoCookies(page, { role: 'owner', plan: 'free', locale: 'en' });
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

When('I fill in the customer code with {string}', async ({ page, world }, code: string) => {
  world.lastCode = code;
  await page.getByLabel('Code', { exact: false }).fill(code);
});

When('I fill in the customer name with {string}', async ({ page }, name: string) => {
  await page.getByLabel('Name', { exact: false }).fill(name);
});

When('I submit the customer form', async ({ page }) => {
  await page.getByRole('button', { name: 'Save' }).click();
});

Then('I should see the customer {string}', async ({ page }, name: string) => {
  await expect(page.getByRole('cell', { name })).toBeVisible();
});

Then('I should see a success confirmation', async ({ page }) => {
  // `role=status` en lugar de un selector de clase: si el aviso no es anunciable por un
  // lector de pantalla, el test debe fallar igual que si no se viese.
  await expect(page.locator('form').getByRole('status')).toContainText('created successfully');
});

Then('I should see an error about a duplicate code', async ({ page, world }) => {
  // Se acota al formulario porque Next monta su propio role="alert" para anunciar los
  // cambios de ruta a los lectores de pantalla. Buscar en toda la pagina encontraria
  // los dos y el selector fallaria por ambiguedad.
  const alert = page.locator('form').getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(world.lastCode ?? '');
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
