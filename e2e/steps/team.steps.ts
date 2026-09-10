import { expect, type Page } from '@playwright/test';
import { Given, When, Then, setDemoCookies, signIn } from './fixtures';

/**
 * Pasos del modulo de equipo.
 *
 * Los correos se generan unicos en cada invitacion. No es paranoia: los
 * escenarios comparten servidor, y una direccion repetida chocaria con la regla
 * de "ya hay una invitacion pendiente para ese correo" — que es correcta, pero
 * haria fallar al segundo escenario por lo que hizo el primero.
 */

const uniqueEmail = () =>
  `invitado-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@corebiz.test`;

Given('I am signed in as a salesperson', async ({ page }) => {
  await setDemoCookies(page, { role: 'sales', locale: 'en' });
  await signIn(page);
});

When('I open the team page', async ({ page }) => {
  await page.goto('/settings/team');
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
});

When('I open the activity page', async ({ page }) => {
  await page.goto('/settings/audit');
});

Then('I should see the person {string}', async ({ page }, email: string) => {
  await expect(page.getByRole('cell', { name: email })).toBeVisible();
});

/**
 * El formulario de invitacion, acotado.
 *
 * La tabla del equipo tiene un `select` de rol por fila, asi que buscar "Role"
 * en toda la pagina encuentra varios y Playwright falla por ambiguedad — con
 * razon. Acotar al aside es ademas lo que describe la intencion: se esta
 * rellenando EL formulario de invitar, no un rol cualquiera de la pantalla.
 */
const inviteForm = (page: Page) => page.getByRole('complementary', { name: /invite someone/i });

When('I invite a new person as a salesperson', async ({ page, world }) => {
  world.lastCode = uniqueEmail();

  const form = inviteForm(page);
  await form.getByLabel(/email/i).fill(world.lastCode);
  await form.getByLabel(/role/i).selectOption('sales');
  await form.getByRole('button', { name: /send invitation/i }).click();
});

Then('I should see a single-use invitation link', async ({ page }) => {
  const link = inviteForm(page).getByLabel(/invitation link/i);
  await expect(link).toBeVisible();

  // El enlace lleva el token en la URL. Es la unica vez que existe fuera del
  // correo de quien invita: lo guardado en la base de datos es su hash.
  await expect(link).toHaveValue(/\/invitations\/accept\?token=.+/);
});

Then('the invitation shows up as pending', async ({ page, world }) => {
  await expect(page.getByRole('cell', { name: world.lastCode ?? '' })).toBeVisible();
});

Then('I should see that the activity log is not for me', async ({ page }) => {
  await expect(
    page.getByText(/only the owner and administrators can see the activity/i),
  ).toBeVisible();
});
