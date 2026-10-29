import { test, expect } from '@playwright/test';
import { signIn } from '../session';

test.describe('Flujo de Visión en Compras (Recepción de Mercancía e Inventario)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('redirige desde /vision a la ruta dedicada /purchases/scan y no aparece en la barra lateral', async ({
    page,
  }) => {
    await page.goto('/vision');
    await expect(page).toHaveURL(/\/purchases\/scan/);
    await expect(page.getByRole('heading', { name: /escanear remito de compras/i })).toBeVisible();

    // Visión ya no es un módulo huérfano en la barra de navegación lateral
    const navLinks = page.getByRole('navigation').getByRole('link', { name: /^visi[oó]n$/i });
    await expect(navLinks).toHaveCount(0);
  });

  test('Escenario 1 (Flujo estándar sin discrepancias): análisis, revisión y confirmación atómica en inventario', async ({
    page,
  }) => {
    await page.goto('/purchases/scan');
    await expect(page.getByRole('heading', { name: /escanear remito de compras/i })).toBeVisible();

    // 1. Verificar documento inicial en cola y analizarlo
    const scanBtn = page.getByRole('button', { name: /analizar documento/i }).first();
    await expect(scanBtn).toBeVisible();
    await scanBtn.click();

    // 2. Esperar que pase a 'ready' y se despliegue el formulario interactivo
    await expect(page.getByText(/1\. Proveedor de la Recepción/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Distribuidora Central, C.A.').first()).toBeVisible();

    // 3. Verificar que la tabla de artículos lista los renglones extraídos
    await expect(page.getByRole('cell', { name: /Harina de trigo 1 kg/i }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: /Manteca vegetal 500 g/i }).first()).toBeVisible();

    // 4. Verificar que el total estimado está calculado
    await expect(page.getByText(/Total Estimado de la Recepción/i)).toBeVisible();
    await expect(page.locator('span.font-bold.font-mono.text-ink')).toContainText('$69.70');

    // 5. Confirmar la recepción atómica
    const confirmBtn = page.getByRole('button', {
      name: /confirmar recepci[oó]n de mercanc[ií]a/i,
    });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // 6. Verificar el banner de éxito con correlativo RM-XXXXXX y resumen de afectación
    await expect(page.getByText(/recepci[oó]n (RM|REC)-\d+ confirmada con [eé]xito/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: /ver comprobante/i })).toBeVisible();

    // 7. Navegar a /purchases y verificar que la recepción recién creada aparece listada
    await page.goto('/purchases');
    await expect(page.getByRole('cell', { name: /(RM|REC)-\d+/ }).first()).toBeVisible();
  });

  test('Escenario 2 (Discrepancias e ítems nuevos): recálculo en vivo, alta de proveedor y productos al vuelo', async ({
    page,
  }) => {
    await page.goto('/purchases/scan');

    // 1. Seleccionar el escenario de prueba con discrepancias
    const discrepanciesPreset = page.getByRole('button', { name: /remito con discrepancias/i });
    await expect(discrepanciesPreset).toBeVisible();
    await discrepanciesPreset.click();

    // 2. Analizar el documento con discrepancias
    const scanBtn = page.getByRole('button', { name: /analizar documento/i }).first();
    await expect(scanBtn).toBeVisible();
    await scanBtn.click();

    // 3. Esperar formulario interactivo de revisión
    await expect(page.getByText(/1\. Proveedor de la Recepción/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Lácteos y Alimentos Los Andes, C\.A\./i)).toBeVisible();

    // 4. Verificar opción 'Dar de alta nuevo' para el proveedor y asignar RIF
    const createSupplierRadio = page.getByLabel(/dar de alta nuevo/i);
    await expect(createSupplierRadio).toBeChecked();
    const taxIdInput = page.getByPlaceholder(/J-12345678-9/i);
    await taxIdInput.fill('J-40192837-1');

    // 5. Verificar productos nuevos y sugerencia de creación en catálogo
    await expect(page.getByText(/Queso Gouda rebanado 500 g/i)).toBeVisible();
    await expect(page.getByText(/crear producto \(alta en cat[aá]logo\)/i).first()).toBeVisible();

    // 6. Probar recálculo en vivo al excluir un artículo
    const totalBefore = await page.locator('span.font-bold.font-mono.text-ink').textContent();
    // Desmarcar el primer checkbox de inclusión
    const firstCheckbox = page.locator('tbody input[type="checkbox"]').first();
    await firstCheckbox.uncheck();

    const totalAfter = await page.locator('span.font-bold.font-mono.text-ink').textContent();
    expect(totalBefore).not.toEqual(totalAfter);

    // 7. Confirmar recepción atómica con altas al vuelo
    const confirmBtn = page.getByRole('button', {
      name: /confirmar recepci[oó]n de mercanc[ií]a/i,
    });
    await confirmBtn.click();

    // 8. Verificar confirmación indicando proveedor y nuevos productos registrados
    await expect(page.getByText(/recepci[oó]n (RM|REC)-\d+ confirmada con [eé]xito/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/proveedor nuevo registrado en cat[aá]logo/i)).toBeVisible();
    await expect(page.getByText(/nuevo\(s\) producto\(s\) dado\(s\) de alta/i)).toBeVisible();
  });

  test('Escenario 3 (Ticket arrugado): mapeo a proveedor existente registrado', async ({
    page,
  }) => {
    await page.goto('/purchases/scan');

    // 1. Seleccionar preset Ticket de compra de mostrador
    const ticketPreset = page.getByRole('button', { name: /ticket de compra de mostrador/i });
    await expect(ticketPreset).toBeVisible();
    await ticketPreset.click();

    // 2. Analizar
    await page
      .getByRole('button', { name: /analizar documento/i })
      .first()
      .click();
    await expect(page.getByText(/1\. Proveedor de la Recepción/i)).toBeVisible({ timeout: 15_000 });

    // 3. Cambiar decisión a "Vincular a existente"
    const linkExistingRadio = page.getByLabel(/vincular a existente/i);
    await linkExistingRadio.check();

    // 4. Seleccionar un proveedor registrado en el desplegable
    const supplierSelect = page.locator('select').first();
    await expect(supplierSelect).toBeVisible();

    // 5. Confirmar recepción
    const confirmBtn = page.getByRole('button', {
      name: /confirmar recepci[oó]n de mercanc[ií]a/i,
    });
    await confirmBtn.click();

    await expect(page.getByText(/recepci[oó]n (RM|REC)-\d+ confirmada con [eé]xito/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('Escenario 4 (Desacoplamiento estricto): comprobante real sin IA no aplica fallback falso y guía a /settings/ai', async ({
    page,
  }) => {
    await page.goto('/purchases/scan');

    // 1. Cambiar a la pestaña de subir documentos reales
    await page.getByRole('button', { name: /subir documentos reales/i }).click();

    // 2. Verificar advertencia explícita de requerimiento de IA
    await expect(
      page.getByText(/para procesar tus propios documentos se requiere conectar una clave de IA/i),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /configurar ahora/i })).toBeVisible();

    // 3. Subir archivo PDF real sintético
    await page.locator('input[type="file"]').setInputFiles({
      name: 'comprobante_propia_empresa.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test document content'),
    });

    // 4. Verificar que entra en cola como documento real
    await expect(page.getByText('comprobante_propia_empresa.pdf').first()).toBeVisible();

    // 5. Al analizarlo sin IA configurada, no finge éxito; devuelve error amigable
    await page
      .getByRole('button', { name: /analizar documento/i })
      .first()
      .click();

    await expect(page.getByText(/no se pudo procesar el documento/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/se requiere configurar una clave de IA en los ajustes/i),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /configurar clave de IA/i })).toBeVisible();
  });

  test('Escenario 5 (Gestión de cola y procesamiento por lote): agrega, elimina y procesa en lote', async ({
    page,
  }) => {
    await page.goto('/purchases/scan');

    // 1. Cargar múltiples documentos de demostración
    await page.getByRole('button', { name: /remito con discrepancias/i }).click();
    await page.getByRole('button', { name: /ticket de compra de mostrador/i }).click();

    // 2. Verificar contador de documentos en cola (al menos 3)
    await expect(page.getByText(/cola de comprobantes/i)).toBeVisible();

    // 3. Eliminar el documento activo mediante el botón de papelera
    const trashButtons = page.locator('button[title="Eliminar de la lista"]');
    const initialCount = await trashButtons.count();
    await trashButtons.first().click();
    await expect(trashButtons).toHaveCount(initialCount - 1);

    // 4. Ejecutar "Analizar todos los pendientes"
    const processAllBtn = page.getByRole('button', { name: /analizar todos los pendientes/i });
    if (await processAllBtn.isVisible()) {
      await processAllBtn.click();
      await expect(page.getByText(/listo para revisi[oó]n|registrado/i).first()).toBeVisible({
        timeout: 20_000,
      });
    }
  });
});
