import { expect, type Page } from '@playwright/test';
import { Given, When, Then, setDemoCookies } from './fixtures';

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
  await setDemoCookies(page, { role: 'sales', plan: 'free', locale: 'en' });
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

Then('I should see how many seats the plan allows', async ({ page }) => {
  // El texto dice "1 de 2 personas". Se comprueba el patron y no la cifra
  // exacta: los escenarios comparten servidor y el consumo cambia segun lo que
  // haya corrido antes. Lo que tiene que ser cierto siempre es que el limite se
  // muestre ANTES de rellenar el formulario, no despues de que bloquee.
  await expect(page.getByText(/\d+ (of|de) \d+ (people|personas)/i)).toBeVisible();
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

When('I keep inviting people until the plan says no', async ({ page }) => {
  // Se invita en bucle hasta que el servidor rechaza. Escribir "invita dos veces
  // y falla la segunda" haria el escenario dependiente del orden: otro escenario
  // pudo gastar una plaza antes, y entonces el rechazo llega en la primera.
  const form = inviteForm(page);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await form.getByLabel(/email/i).fill(uniqueEmail());
    await form.getByRole('button', { name: /send invitation/i }).click();

    if (
      await form
        .getByRole('alert')
        .isVisible()
        .catch(() => false)
    )
      return;
  }

  throw new Error('El plan gratuito acepto cuatro invitaciones sin bloquear');
});

Then('I should see that there are no seats left', async ({ page }) => {
  const alert = inviteForm(page).getByRole('alert');
  await expect(alert).toBeVisible();

  // El mensaje viene del caso de uso, que devuelve el limite del plan. Si el
  // bloqueo lo pusiera la pantalla, este texto no podria hablar del plan.
  await expect(alert).toContainText(/plan allows/i);
});

Then('I should see that the activity log is not for me', async ({ page }) => {
  await expect(
    page.getByText(/only the owner and administrators can see the activity/i),
  ).toBeVisible();
});
