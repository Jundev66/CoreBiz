import { test, expect } from '@playwright/test';
import { signIn } from '../session';

test.describe('Flujo de Visión integrado en Notas de Entrega', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('redirige desde /vision a la nueva nota de entrega con escáner activo', async ({ page }) => {
    await page.goto('/vision');
    await expect(page).toHaveURL(/\/delivery-notes\/new\?scan=1/);
    await expect(page.getByRole('heading', { name: /nueva nota de entrega/i })).toBeVisible();
    await expect(page.getByText(/captura y lectura con visi[oó]n/i)).toBeVisible();
  });

  test('flujo normal sin IA: escanea remito de muestra, hidrata el formulario y emite la nota', async ({
    page,
  }) => {
    // 1. Ir al módulo de Notas de Entrega
    await page.goto('/delivery-notes');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // 2. Verificar que Visión ya no es un módulo en la barra de navegación lateral
    const navLinks = page.getByRole('navigation').getByRole('link', { name: /^visi[oó]n$/i });
    await expect(navLinks).toHaveCount(0);

    // 3. El botón "Escanear remito" está disponible en Notas de Entrega
    const scanActionBtn = page.getByRole('link', { name: /escanear remito/i }).first();
    await expect(scanActionBtn).toBeVisible();
    await scanActionBtn.click();

    await expect(page).toHaveURL(/\/delivery-notes\/new\?scan=1/);
    await expect(page.getByText(/captura y lectura con visi[oó]n/i)).toBeVisible();

    // 4. Ejecutar la lectura del documento de muestra (modo determinista sin IA)
    const scanButton = page.getByRole('button', { name: /leer documento/i });
    await expect(scanButton).toBeVisible();
    await scanButton.click();

    // 5. Esperar extracción completada
    await expect(page.getByText('Extracción completada')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Distribuidora Central, C.A.')).toBeVisible();

    // 6. Aplicar los datos extraídos al formulario
    const applyBtn = page.getByRole('button', { name: /cargar datos en el formulario/i });
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();

    // 7. Verificar que el escáner se repliega y se muestra la confirmación
    await expect(page.getByText(/datos del documento cargados en el formulario/i)).toBeVisible();

    // 8. Verificar que el formulario fue hidratado con las líneas
    const firstQuantityInput = page.locator('input[name="line-quantity"]').first();
    await expect(firstQuantityInput).not.toHaveValue('');

    // 9. Asegurar cliente seleccionado si la muestra no coincidió con un cliente existente
    const customerSelect = page.locator('#customerId');
    const selectedCustomer = await customerSelect.inputValue();
    if (!selectedCustomer) {
      await customerSelect.selectOption({ index: 1 });
    }

    // 10. Emitir la nota de entrega
    const submitBtn = page.getByRole('button', { name: /emitir/i });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // 11. Confirmar que se generó la nota NE-XXXXXX en el ERP
    await page.waitForURL(/\/delivery-notes(\?|$)/);
    const noteStatus = page.getByRole('status').filter({ hasText: /NE-\d+/ });
    await expect(noteStatus).toBeVisible();
  });

  test('validación amigable al subir archivos no compatibles en el escáner integrado', async ({
    page,
  }) => {
    // 1. Ir a nueva nota de entrega
    await page.goto('/delivery-notes/new');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // 2. Abrir el escáner desde el banner
    const openScannerBtn = page.getByRole('button', { name: /escanear con visi[oó]n/i });
    await expect(openScannerBtn).toBeVisible();
    await openScannerBtn.click();

    await expect(page.getByText(/captura y lectura con visi[oó]n/i)).toBeVisible();

    // 3. Cambiar a subir comprobante propio
    await page.getByRole('button', { name: /subir comprobante/i }).click();

    // 4. Subir archivo no soportado
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

    // 5. Verificar alerta para usuario sin código 500
    const alert = page
      .getByRole('alert')
      .filter({ hasText: /formato del archivo no es compatible/i });
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText('500');
    await expect(alert).not.toContainText('El host respondio');
  });
});
