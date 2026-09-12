import { expect, type Page } from '@playwright/test';
import { When, Then } from './fixtures';

/**
 * Help panel steps.
 *
 * Located by ROLE and accessible name, like the rest of the suite, not by a test attribute:
 * a `<details>` is announced as `group` and named after its `<summary>`. Finding it this way
 * also checks what really matters — that the panel has a name and is reachable by keyboard —
 * instead of checking that someone remembered an invisible label.
 */

function panel(page: Page) {
  return page.getByRole('group', { name: /ayuda|help/i });
}

When('I open the help panel', async ({ page }) => {
  // Click the summary, which is how a person opens it. Setting `open` by hand would skip
  // exactly the part that might be broken.
  await panel(page).locator('summary').click();
  await expect(panel(page)).toHaveAttribute('open', '');
});

Then('it tells me what happened and what I can do', async ({ page }) => {
  const opened = panel(page);

  // Both headings, with text underneath. Sections existing without content is exactly the
  // failure a key guardian cannot see: next-intl would render the raw key, the screen would
  // answer 200 and nobody would notice.
  for (const heading of [/qué ha pasado|what happened/i, /qué puedes hacer|what you can do/i]) {
    await expect(opened.getByRole('heading', { name: heading })).toBeVisible();
  }

  // And not the raw key. `NoLines` on screen would be exactly how this fails without an
  // error.
  await expect(opened).not.toContainText('NoLines');
  await expect(opened).not.toContainText('assistant.playbooks');
});

Then('it only tells me what it is for', async ({ page }) => {
  const opened = panel(page);

  await expect(opened).toContainText(/ábreme|open this/i);
  await expect(opened.getByRole('heading', { name: /qué ha pasado|what happened/i })).toHaveCount(
    0,
  );
});
