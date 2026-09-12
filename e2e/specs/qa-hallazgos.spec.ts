import { test, expect } from '@playwright/test';
import { POSTGRES, signIn } from '../session';

/**
 * Defects found by the exploratory QA session of 2026-09-12.
 *
 * Every test describes the CORRECT behaviour. Fixed defects are plain regression tests
 * marked with a FIXED comment. An open defect would carry `test.fail()`, which is not the
 * same as `test.fixme()`: `fixme` skips the test and checks nothing, while `fail` RUNS it
 * and requires it to fail. The defect stays documented and reproducible, the suite stays
 * green, and the day someone fixes it Playwright reports an unexpected pass — which is
 * exactly when to come here, remove the mark and keep it as a regression test.
 *
 * The report with steps and severity is in `docs/QA-2026-09-12.md`.
 */

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

// ─── P1 ──────────────────────────────────────────────────────────────────────

// FIXED. Kept as a regression test: it was an open redirect.
test('the wait screen does not send you off-site', async ({ page }) => {
  // `/\other-origin` passed the old check — it starts with a slash and the second character
  // is not one — and the browser resolved it as an absolute URL on another origin.
  // `safeInternalPath` now decides by resolving against a control origin. The three vectors:
  const detours = [
    '/%5C127.0.0.1:3211/health', // backslash
    '//127.0.0.1:3211/health', // double slash
    'https://127.0.0.1:3211/health', // plain absolute URL
  ];

  for (const detour of detours) {
    await page.goto(`http://localhost:3210/waking-up?next=${detour}`);
    await page.waitForTimeout(2500);

    expect(new URL(page.url()).host, `should not leave the site with ${detour}`).toBe(
      'localhost:3210',
    );
  }
});

// FIXED. Kept as a regression test: it was a data-integrity defect.
test('a negative price issues no document, and says so', async ({ page }) => {
  // An ordinary typo. `Money` allows negatives on purpose and the domain did not check the
  // price sign, so in memory the note WAS ISSUED with a negative total — deducting stock —
  // and on Postgres a table constraint stopped it, i.e. a 500. Two behaviours for one error.
  //
  // Both halves of the fix are checked: the person is told something, and NO negative
  // document remains. It deliberately does not assert the text mentions the "price": it
  // still says `lines[1].unitPrice`, and technical field names in messages are a separate
  // defect, still open.
  await page.goto('/delivery-notes/new');
  await page.locator('select[name="customerId"]').selectOption({ index: 1 });
  await page.locator('select[name="line-product"]').selectOption({ index: 2 });
  await page.locator('input[name="line-quantity"]').fill('2');
  await page.locator('input[name="line-price"]').fill('-5');
  await page.getByRole('button', { name: 'Emitir' }).click();

  await expect(page.getByRole('alert').first()).toBeVisible();

  // Against the already rendered list, so the check runs on stable content: a negative
  // assertion on a half-loaded screen passes on its own.
  await page.goto('/delivery-notes');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.locator('tbody')).not.toContainText('$ -');
});

// ─── P2 ──────────────────────────────────────────────────────────────────────

// FIXED. Kept as a regression test: it was the server error page on a module the app's
// own menu offered.
test.describe('a role without permission does not break the screen', () => {
  /*
   * Three roles and three screens, the three cases the QA session saw crash: read-only on
   * "Reports", warehouse on "Customers", sales on "Purchases".
   *
   * Each checks both halves of the fix: the screen explains instead of crashing
   * (`@/ui/no-access`), and the entry is NO LONGER in the menu, which is what made it one
   * click away (`@/auth/module-access`).
   *
   * A POSITIVE signal is awaited before the negative assertion. Without it,
   * `not.toContainText` passes instantly on a half-rendered screen and the test would pass
   * without having looked at anything.
   */
  for (const scenario of [
    { role: 'viewer', route: '/reports', link: /reportes|reports/i },
    { role: 'warehouse', route: '/customers', link: /^clientes$|^customers$/i },
    { role: 'sales', route: '/purchases', link: /^compras$|^purchases$/i },
  ]) {
    test(`${scenario.role} on ${scenario.route}`, async ({ page, context }) => {
      await context.addCookies([
        { name: 'corebiz_demo_role', value: scenario.role, url: 'http://localhost:3210' },
      ]);
      await page.goto(scenario.route);

      // The specific notice rather than any `role=status`: the frame already has others,
      // and one of them would match without the explanation having rendered.
      await expect(page.getByText(/no está en tu alcance|outside your access/i)).toBeVisible();
      await expect(page.locator('body')).not.toContainText('A server error occurred');

      const menu = page.getByRole('navigation').first();
      await expect(menu.getByRole('link', { name: scenario.link })).toHaveCount(0);
    });
  }
});

// FIXED. Kept as a regression test: a mistyped parameter took the whole screen down
// (`new Date('abc')` ending in `.toISOString()`).
test('an invalid date in the audit log does not break the screen', async ({ page }) => {
  await page.goto('/settings/audit?from=abc');

  // The heading first, which proves the screen really rendered.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('A server error occurred');

  // The impossible filter is dropped, so the field is empty instead of carrying `abc`
  // into the next query.
  await expect(page.locator('input[name="from"]')).toHaveValue('');
});

// FIXED. Kept as a regression test: the zod message IS the translation key, and
// `Importe invalido` was not one.
test('an amount with a thousands separator does not render a raw key', async ({ page }) => {
  // The field's own placeholder says "1500,00", so typing "1.500,00" is what anyone in
  // Venezuela does. It rendered `errors.Importe invalido` under the field.
  await page.goto('/customers/new');
  await page.getByRole('textbox', { name: 'Nombre' }).fill('Ferreteria Dos Caminos');
  await page.getByRole('textbox', { name: 'Límite de crédito' }).fill('1.500,00');
  await page.getByRole('button', { name: 'Guardar' }).click();

  // Wait for the notice to APPEAR first. Without that wait, `not.toContainText` passes
  // instantly — before the Server Action answers — and the test would pass having looked at
  // nothing.
  const notice = page.locator('p', { hasText: /importe/i });
  await expect(notice).toBeVisible();
  await expect(notice).not.toContainText('errors.');
});

// DECIDED, not fixed: the panel does NOT explain field errors. The message sits under the
// field that caused it, with the field name in it, and a card saying "check the field" next
// to a field already in red only gets in the way (`FIELD_SHAPE_KINDS`).
//
// What WAS a defect is what was left in its place, and that is what this tests: the panel
// kept explaining an EARLIER, already solved error for five minutes while the screen pointed
// at a different problem. A shape rejection now clears it.
test('the panel stops explaining an error that is already solved', async ({ page }) => {
  // 1. A real failure the panel does explain: issuing a note with no lines.
  await page.goto('/delivery-notes/new');
  await page.locator('select[name="customerId"]').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Emitir' }).click();

  const panel = page.getByRole('group', { name: /ayuda|help/i });
  await panel.locator('summary').click();
  await expect(panel.getByRole('heading', { name: /qué ha pasado|what happened/i })).toBeVisible();

  // 2. Another screen, another problem: a name that is too short, validated by the web.
  await page.goto('/customers/new');
  await page.getByRole('textbox', { name: 'Nombre' }).fill('A');
  await page.getByRole('button', { name: 'Guardar' }).click();

  // The field message appears...
  await expect(page.locator('#name-error')).toBeVisible();

  // ...and the panel goes back to idle instead of explaining the delivery note.
  await panel.locator('summary').click();
  await expect(panel.getByText(/ábreme|open this/i)).toBeVisible();
  await expect(panel.getByRole('heading', { name: /qué ha pasado|what happened/i })).toHaveCount(0);
});

// FIXED. Kept as a regression test: the URL lent the app's official look to a foreign
// message.
test('the URL cannot invent a success notice', async ({ page }) => {
  const hook = 'texto inyectado por la URL';
  await page.goto(`/delivery-notes?creado=${encodeURIComponent('NE-000999. ' + hook)}`);

  // Against the rendered body: `?creado=` only admits something shaped like a code, so a
  // sentence renders no notice at all.
  await expect(page.locator('body')).not.toContainText(hook);
});

// FIXED. Same filter: an array where a string was expected.
test('a repeated parameter does not render the translation key', async ({ page }) => {
  await page.goto('/customers?creado=uno&creado=dos');

  await expect(page.locator('body')).not.toContainText('customers.created');
});

// ─── Postgres only ───────────────────────────────────────────────────────────

// FIXED. Kept as a regression test, still tied to Postgres: in memory it already passed
// before the fix, which is exactly what made it invisible.
test('a malformed id gives 404, not a server error', async ({ page }) => {
  test.skip(!POSTGRES, 'requires Supabase: run with E2E_DRIVER=postgres');

  // The id reached the database, failed on format and produced a 500. The adapter now
  // discards it (`prisma/record-id.ts`) and the answer is the usual one for something that
  // does not exist.
  for (const route of ['/customers/abc', '/products/abc', '/purchases/suppliers/abc']) {
    await page.goto(route);

    // The app's own 404, in the app's language: not Next's English one.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('A server error occurred');
    await expect(page.locator('body')).not.toContainText('This page could not be found');
  }
});

// ── Own error and 404 screens ────────────────────────────────────────────────

// New in this round: neither `app/error.tsx` nor `app/not-found.tsx` existed, so every
// failure used Next's default screen, in English and with no way out.
test('an address that does not exist shows the own screen, with a way out', async ({ page }) => {
  const response = await page.goto('/esta-ruta-no-existe-en-ningun-sitio');

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('This page could not be found');

  // What was really missing: a way back.
  await page.getByRole('link', { name: /inicio|start/i }).click();
  await expect(page).toHaveURL('http://localhost:3210/');
});
