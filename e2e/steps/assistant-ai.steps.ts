import { expect, type Page } from '@playwright/test';
import { When, Then } from './fixtures';

/** Steps for the AI half of the help panel. The panel itself is opened by `assistant.steps`. */

function panel(page: Page) {
  return page.getByRole('group', { name: /ayuda|help/i });
}

Then('it explains how to turn on the AI assistant', async ({ page }) => {
  const opened = panel(page);

  // The status is asked when the panel opens, so the connect button appears a moment later.
  await expect(
    opened.getByRole('link', { name: /connect an ai|conectar una ia|conectar ia/i }),
  ).toBeVisible();
  await expect(opened).not.toContainText('assistant.setup');
});

When('I follow the link to connect an AI', async ({ page }) => {
  await panel(page)
    .getByRole('link', { name: /connect an ai|conectar una ia|conectar ia/i })
    .click();
  await expect(page).toHaveURL(/\/settings\/ai$/);
});

Then('I see the AI connection screen with the four providers', async ({ page }) => {
  // Scoped to `main`: the help panel lives in the frame and may still be open beside it.
  const screen = page.getByRole('main');
  await expect(screen.getByRole('heading', { name: 'AI assistant' })).toBeVisible();
  for (const name of ['Ollama', 'Claude (Anthropic)', 'Gemini (Google)', 'OpenAI-compatible']) {
    await expect(screen.getByRole('radio', { name })).toBeVisible();
  }
  // Nothing to choose until the provider has been asked which models the key can use.
  await expect(screen.getByRole('combobox', { name: /choose the model/i })).toBeDisabled();
});

Then('it tells me to ask an owner or admin to connect the AI', async ({ page }) => {
  const opened = panel(page);

  await expect(opened).toContainText(/ask an owner or admin|pídele a un dueño o administrador/i);
  await expect(opened.getByRole('link', { name: /connect an ai|conectar ia/i })).toHaveCount(0);
});
