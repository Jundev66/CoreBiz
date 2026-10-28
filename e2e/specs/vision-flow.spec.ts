import { test, expect } from '@playwright/test';
import { signIn } from '../session';

test.describe('Flujo de Visión en Compras (Recepción de Mercancía e Inventario)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('redirige desde /vision a la ruta dedicada /purchases/scan', async ({ page }) => {
    await page.goto('/vision');
    await expect(page).toHaveURL(/\/purchases\/scan/);
    await expect(page.getByRole('heading', { name: /escanear remito de compras/i })).toBeVisible();
  });

  test('flujo determinista sin IA: escanea remito en /purchases/scan y registra la recepción directamente', async ({
    page,
  }) => {
    // 1. Ir al módulo de Compras
    await page.goto('/purchases');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // 2. Verificar que Visión ya no es un módulo en la barra de navegación lateral
    const navLinks = page.getByRole('navigation').getByRole('link', { name: /^visi[oó]n$/i });
    await expect(navLinks).toHaveCount(0);

    // 3. El botón "Escanear remito" lleva a la ruta dedicada /purchases/scan
    const scanActionBtn = page.getByRole('link', { name: /escanear remito/i }).first();
    await expect(scanActionBtn).toBeVisible();
    await scanActionBtn.click();

    await expect(page).toHaveURL(/\/purchases\/scan/);
    await expect(page.getByRole('heading', { name: /escanear remito de compras/i })).toBeVisible();

    // 4. Ejecutar la lectura del documento de muestra (modo determinista sin IA)
    const scanButton = page.getByRole('button', { name: /leer documento/i });
    await expect(scanButton).toBeVisible();
    await scanButton.click();

    // 5. Esperar extracción completada
    await expect(page.getByText('Extracción completada')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Distribuidora Central, C.A.')).toBeVisible();

    // 6. Registrar la recepción directamente en inventario mediante el botón primario
    const directRegisterBtn = page.getByRole('button', {
      name: /registrar recepci[oó]n de mercanc[ií]a/i,
    });
    await expect(directRegisterBtn).toBeVisible();
    await directRegisterBtn.click();

    // 7. Verificar el aviso de confirmación con el correlativo asignado
    await expect(page.getByText(/recepci[oó]n (RM|REC)-\d+ registrada con [eé]xito/i)).toBeVisible({
      timeout: 15_000,
    });

    // 8. Navegar a /purchases y verificar que la recepción recién creada aparece listada
    await page.goto('/purchases');
    await expect(page.getByRole('cell', { name: /(RM|REC)-\d+/ }).first()).toBeVisible();
  });

  test('flujo asistido con formulario: escanea remito y transfiere los datos a /purchases/new para revisión', async ({
    page,
  }) => {
    // 1. Ir a la pantalla de escaneo
    await page.goto('/purchases/scan');

    // 2. Ejecutar la lectura del documento de muestra
    const scanButton = page.getByRole('button', { name: /leer documento/i });
    await expect(scanButton).toBeVisible();
    await scanButton.click();

    await expect(page.getByText('Extracción completada')).toBeVisible({ timeout: 15_000 });

    // 3. Hacer clic en "Cargar en formulario de compras"
    const applyBtn = page.getByRole('button', { name: /cargar en formulario de compras/i });
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();

    // 4. Verificar que navegó a /purchases/new con los datos precargados
    await expect(page).toHaveURL(/\/purchases\/new/);
    await expect(page.getByText(/datos del remito cargados correctamente/i)).toBeVisible();

    // 5. Verificar que el formulario fue hidratado con las líneas
    const firstQuantityInput = page.locator('input[name="quantity"]').first();
    await expect(firstQuantityInput).not.toHaveValue('');

    // 6. Confirmar la recepción desde el formulario
    const submitBtn = page.getByRole('button', { name: /registrar la entrada/i });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // 7. Esperar redirección a /purchases con el código creado
    await page.waitForURL(/\/purchases(\?|$)/);
    const receiptStatus = page.getByRole('status').filter({ hasText: /(RM|REC)-\d+/ });
    await expect(receiptStatus).toBeVisible();
  });

  test('validación amigable al subir archivos no compatibles en la pantalla de escaneo', async ({
    page,
  }) => {
    // 1. Ir directamente a la pantalla de escaneo de compras
    await page.goto('/purchases/scan');
    await expect(page.getByRole('heading', { name: /escanear remito de compras/i })).toBeVisible();

    // 2. Cambiar a subir comprobante propio
    await page.getByRole('button', { name: /subir comprobante/i }).click();

    // 3. Subir archivo no soportado
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

    // 4. Verificar alerta amigable para el usuario sin códigos HTTP 500
    const alert = page
      .getByRole('alert')
      .filter({ hasText: /formato del archivo no es compatible/i });
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText('500');
    await expect(alert).not.toContainText('El host respondio');
  });
});
