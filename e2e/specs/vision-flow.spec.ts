import { test, expect } from '@playwright/test';
import { signIn } from '../session';

test.describe('Flujo de Visión en Producción', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('la vista /vision carga, extrae datos de muestra y maneja errores amigables', async ({
    page,
  }) => {
    // 1. Navegar a /vision
    await page.goto('/vision');
    await expect(page).toHaveURL(/\/vision$/);
    await expect(page.getByRole('heading', { name: /synapse visi[oó]n|visi[oó]n/i })).toBeVisible();

    // 2. Extraer documento de muestra
    const scanButton = page.getByRole('button', { name: /leer documento/i });
    await expect(scanButton).toBeVisible();
    await scanButton.click();

    // 3. Verificar que completa la extracción
    await expect(page.getByText('Extracción completada')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Distribuidora Central, C.A.')).toBeVisible();

    // 3.1 Probar la generación de la nota de entrega en el ERP
    const generateBtn = page.getByRole('button', { name: /generar nota de entrega/i });
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();
    await expect(page.getByText(/generada con [eé]xito/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: /ver nota de entrega/i })).toBeVisible();

    // 4. Cambiar a subir archivo propio
    await page.getByRole('button', { name: /subir archivo propio/i }).click();

    // 5. Subir archivo no soportado para verificar validación amigable al cliente
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page
      .getByRole('button', { name: /cambiar archivo/i })
      .or(page.locator('[role="button"]:has-text("Arrastra y suelta")'))
      .first()
      .click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'archivo_invalido.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Contenido de prueba no válido'),
    });

    // 6. Verificar que la alerta para usuario no técnico es clara y no muestra código 500
    const alert = page.getByRole('region', { name: /lectura de documentos/i }).getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText('500');
    await expect(alert).not.toContainText('El host respondio');
    await expect(alert).toContainText(
      /formato del archivo no es compatible|comprobante|nota de entrega/i,
    );
  });
});
