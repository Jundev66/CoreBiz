import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { POSTGRES, signIn } from '../session';

/**
 * The help panel against a cookie someone has tampered with.
 *
 * `corebiz_last_error` is `httpOnly`, which protects less than it seems: it stops
 * JavaScript from READING it, not the browser's user from writing it in the developer
 * tools, nor an injected script from creating it if it does not exist yet. What the panel
 * reads from it is user input.
 *
 * And the panel lives in the frame of every signed-in screen. A value that crashes it does
 * not break one screen: it breaks all of them at once, for five minutes, with none left to
 * fix it from. That is exactly what an object in `incidentId` did before the contract
 * validated its shape.
 *
 * These cases run in memory, without a database: what is tested is the screen.
 */

const COOKIE = 'corebiz_last_error';

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

/**
 * Sets the cookie the way the application would.
 *
 * Next encodes the value with `encodeURIComponent` when writing and decodes it when
 * reading; whoever tampers with it has to do the same for it to reach the parser, so the
 * test does too.
 */
async function plant(context: BrowserContext, baseURL: string | undefined, value: string) {
  await context.addCookies([{ name: COOKIE, value: encodeURIComponent(value), url: baseURL! }]);
}

function panel(page: Page) {
  return page.getByRole('group', { name: /ayuda|help/i });
}

async function openPanel(page: Page) {
  await panel(page).locator('summary').click();
  await expect(panel(page)).toHaveAttribute('open', '');
}

const HOSTILE: readonly { name: string; value: string; forbidden?: string }[] = [
  {
    name: 'an object in incidentId',
    value: JSON.stringify({ kind: 'Unexpected', incidentId: { x: 1 } }),
  },
  {
    name: 'an array in incidentId',
    value: JSON.stringify({ kind: 'Unexpected', incidentId: [{}] }),
  },
  {
    // The most harmful outcome is not breaking something: it is the application lending
    // its official look — monospace box, "Reference" label — to text it did not write.
    name: 'a fake reference asking for a password',
    value: JSON.stringify({
      kind: 'Unexpected',
      incidentId: 'INC-1A2B3C4D llame al 900 000 000 y facilite su contraseña',
    }),
    forbidden: 'facilite su contraseña',
  },
  {
    name: 'HTML in incidentId',
    value: JSON.stringify({ kind: 'Unexpected', incidentId: '<img src=x onerror=alert(1)>' }),
    forbidden: 'onerror',
  },
  {
    // `'constructor' in {}` is true. The panel used to render the raw key path and build a
    // link with `href={Object}`.
    name: 'a key inherited from the prototype',
    value: JSON.stringify({ kind: 'constructor', incidentId: null }),
    forbidden: 'constructor',
  },
  {
    name: 'a kind that is not a key',
    value: JSON.stringify({ kind: 'Llame a soporte al 900 000 000', incidentId: null }),
    forbidden: '900 000 000',
  },
  { name: 'truncated JSON', value: '{"kind":' },
  {
    name: 'almost the size limit of a cookie',
    value: JSON.stringify({ kind: 'Unexpected', incidentId: 'A'.repeat(3500) }),
    forbidden: 'AAAAAAAAAA',
  },
];

test.describe('Tampered last-error cookie', () => {
  for (const { name, value, forbidden } of HOSTILE) {
    test(`with ${name}, the screen stays up and the panel does not render it`, async ({
      page,
      context,
      baseURL,
    }) => {
      const dialogs: string[] = [];
      page.on('dialog', (d) => {
        dialogs.push(d.message());
        void d.dismiss();
      });

      await plant(context, baseURL, value);
      await page.goto('/delivery-notes');

      // The whole screen, not only the panel: if the panel crashes, the frame goes down.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await openPanel(page);
      // No raw key from any part of the panel. Searching only for `assistant.playbooks`
      // let `assistant.reference` through: it existed in neither language and was rendered
      // verbatim under the label that should have said "Reference".
      await expect(panel(page)).not.toContainText('assistant.');
      if (forbidden !== undefined) {
        await expect(panel(page)).not.toContainText(forbidden);
      }

      expect(await page.locator('img[src="x"]').count()).toBe(0);
      expect(dialogs).toEqual([]);
    });
  }
});

test.describe('Legitimate last-error cookie', () => {
  test('a reference with the exact shape is still shown', async ({ page, context, baseURL }) => {
    // The other side of strict parsing: validation must not cost the case the reference
    // exists for.
    await plant(
      context,
      baseURL,
      JSON.stringify({ kind: 'Unexpected', incidentId: 'INC-1A2B3C4D' }),
    );
    await page.goto('/delivery-notes');
    await openPanel(page);

    await expect(panel(page)).toContainText('INC-1A2B3C4D');
    await expect(
      panel(page).getByRole('heading', { name: /^(referencia|reference)$/i }),
    ).toBeVisible();
    await expect(panel(page)).not.toContainText('assistant.');
  });

  test('a key with a card is still explained', async ({ page, context, baseURL }) => {
    await plant(context, baseURL, JSON.stringify({ kind: 'NoLines', incidentId: null }));
    await page.goto('/delivery-notes');
    await openPanel(page);

    await expect(
      panel(page).getByRole('heading', { name: /qué ha pasado|what happened/i }),
    ).toBeVisible();
    await expect(panel(page)).not.toContainText('assistant.');
  });
});

test.describe('The explanation belongs to the browser, not the person', () => {
  test('signing out takes it away', async ({ page, context, baseURL }) => {
    test.skip(!POSTGRES, 'requires Supabase: run with E2E_DRIVER=postgres');

    /*
     * The shared counter: A hits a rule, signs out, and B signs in within the next five
     * minutes. Without clearing it on sign-out, B's panel would explain in detail what went
     * wrong for A.
     */
    await plant(context, baseURL, JSON.stringify({ kind: 'NoLines', incidentId: null }));
    await page.goto('/delivery-notes');
    await openPanel(page);
    await expect(
      panel(page).getByRole('heading', { name: /qué ha pasado|what happened/i }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: /cerrar sesión|sign out/i })
      .first()
      .click();
    await page.waitForURL(/\/login/);

    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === COOKIE)).toBeUndefined();
  });
});
