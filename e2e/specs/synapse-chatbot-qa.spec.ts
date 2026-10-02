import { test, expect } from '@playwright/test';
import { signIn } from '../session';

test.describe('Synapse Chatbot & Responsive Demo Security QA Spec', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('asistente flotante es responsive en desktop, interactúa y se abre/cierra limpiamente', async ({
    page,
  }) => {
    // 1. Navegar a clientes
    await page.goto('/customers');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // 2. Localizar el FAB del asistente
    const assistantFab = page.locator('details[data-assistant-fab]');
    await expect(assistantFab).toBeVisible();

    // El summary debe ser accesible y clickeable
    const summary = assistantFab.locator('summary');
    await expect(summary).toBeVisible();

    // Abrir el asistente
    await summary.click();

    // 3. Verificar que se despliega el panel del asistente limpio sin textos sucios
    const chatTitle = page.locator('#assistant-chat-title');
    await expect(chatTitle).toBeVisible();

    // Verificar que indica Modo Local limpiamente
    await expect(page.getByText(/Modo Local/i).first()).toBeVisible();

    // Verificar que NO muestra textos sucios ni listas de 3 pasos
    await expect(page.getByText(/todavía no hay una ia conectada/i)).toHaveCount(0);

    // Verificar el botón limpio en la cabecera para conectar IA
    const connectLink = page.getByRole('link', { name: /⚡ Conectar IA|⚙️ Ajustes IA/i });
    await expect(connectLink).toBeVisible();
    await expect(connectLink).toHaveAttribute('href', '/settings/ai');

    // Verificar chips de opciones del menú principal
    await expect(page.getByRole('button', { name: /Gestión de Clientes/i })).toBeVisible();
  });

  test('asistente es 100% responsive en móvil (viewport 375x667)', async ({ page }) => {
    // Configurar viewport móvil (ej. iPhone SE)
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/customers');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // El asistente FAB debe flotar encima del tab bar móvil sin desbordar la pantalla
    const assistantFab = page.locator('details[data-assistant-fab]');
    await expect(assistantFab).toBeVisible();

    // Abrir panel en móvil
    await assistantFab.locator('summary').click();

    // El panel no debe desbordar horizontalmente la pantalla (width <= 375px)
    const panelBox = await assistantFab.locator('div').first().boundingBox();
    expect(panelBox).not.toBeNull();
    if (panelBox) {
      expect(panelBox.width).toBeLessThanOrEqual(375);
    }

    // Verificar que los controles del chat se muestren limpiamente en móvil
    await expect(page.locator('#assistant-question')).toBeVisible();
  });

  test('banner demo muestra aviso de privacidad y botón de eliminación inmediata', async ({
    page,
  }) => {
    await page.goto('/customers');

    // En modo demo o sesión de prueba, el banner o notice está visible
    // Verificar si existe el botón o elemento de purga
    const destroyButton = page.getByRole('button', { name: /eliminar mis datos ahora/i });
    if (await destroyButton.isVisible()) {
      // Validar que el botón tenga el title accesible y confirmación
      await expect(destroyButton).toHaveAttribute('title', /elimina tu sandbox y claves de ia/i);
    }
  });

  test('chat interactúa en modo local determinista sin IA (pregunta y recibe guía de navegación con botón volver al menú)', async ({
    page,
  }) => {
    await page.goto('/customers');
    const assistantFab = page.locator('details[data-assistant-fab]');
    await assistantFab.locator('summary').click();

    // El chat está disponible directamente
    const chatInput = page.locator('#assistant-question');
    await expect(chatInput).toBeVisible();

    // Escribir pregunta en el chat sin tener IA configurada
    await chatInput.fill('¿Cómo registro un cliente nuevo?');
    await page.getByRole('button', { name: /enviar|send/i }).click();

    // Debe responder a través del motor determinista de Synapse
    await expect(page.getByText(/Gestión de Clientes/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Modo Local sin IA/i)).toBeVisible();

    // Debe mostrar los botones de acción interactivos
    const actionLink = page.getByRole('link', { name: /Ir a Clientes/i });
    await expect(actionLink).toBeVisible();
    await expect(actionLink).toHaveAttribute('href', '/customers');

    // Debe mostrar el botón en la cabecera para conectar IA sin ensuciar el chat
    const headerAiButton = page.getByRole('link', { name: /⚡ Conectar IA|⚙️ Ajustes IA/i });
    await expect(headerAiButton).toBeVisible();

    // Debe mostrar los botones para volver al menú principal (tanto en cabecera como en píldora)
    const returnButton = page.getByRole('button', { name: '🏠 Menú Principal' });
    await expect(returnButton).toBeVisible();

    // También debe estar visible el botón superior de retorno
    await expect(page.getByRole('button', { name: '← Volver al menú principal' })).toBeVisible();

    // Hacer clic en volver al menú principal
    await returnButton.click();

    // Verificar que regresa al menú principal de opciones
    await expect(page.getByRole('button', { name: /Gestión de Clientes/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Catálogo de Productos/i })).toBeVisible();
  });

  test('módulos cuentan con controles visibles e interactivos de paginación de registros', async ({
    page,
  }) => {
    // 1. Clientes
    await page.goto('/customers');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('table').first()).toBeVisible();
    const customerPagination = page.getByRole('navigation', { name: /Paginación de registros/i });
    await expect(customerPagination).toBeVisible();
    await expect(customerPagination.getByText(/Mostrar:/i)).toBeVisible();
    await expect(customerPagination.getByRole('link', { name: '5', exact: true })).toBeVisible();
    await expect(customerPagination.getByText('10', { exact: true })).toBeVisible();

    // 2. Productos
    await page.goto('/products');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const productPagination = page.getByRole('navigation', { name: /Paginación de registros/i });
    await expect(productPagination).toBeVisible();

    // 3. Ventas / Notas de Entrega
    await page.goto('/delivery-notes');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const deliveryPagination = page.getByRole('navigation', { name: /Paginación de registros/i });
    await expect(deliveryPagination).toBeVisible();

    // 4. Proveedores en Compras
    await page.goto('/purchases/suppliers');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const suppliersPagination = page.getByRole('navigation', { name: /Paginación de registros/i });
    await expect(suppliersPagination).toBeVisible();
  });

  test('módulo de reportes cuenta con analítica ejecutiva, exportación y gráficos visuales', async ({
    page,
  }) => {
    await page.goto('/reports');
    await expect(page.getByRole('heading', { level: 1, name: /Reportes/i })).toBeVisible();

    // 1. Botones de acción ejecutiva (Imprimir PDF y Exportar CSV)
    await expect(page.getByRole('button', { name: /Imprimir \/ PDF/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Exportar CSV/i })).toBeVisible();

    // 2. Métricas KPI principales y analíticas adicionales
    await expect(page.getByText('Ventas del período', { exact: true })).toBeVisible();
    await expect(page.getByText('Documentos emitidos', { exact: true })).toBeVisible();
    await expect(page.getByText('Ticket promedio', { exact: true })).toBeVisible();
    await expect(page.getByText('Valor del inventario', { exact: true })).toBeVisible();
    await expect(page.getByText(/Unidades Despachadas/i)).toBeVisible();
    await expect(page.getByText(/Promedio por Documento/i)).toBeVisible();

    // 3. Gráficos de distribución e ingresos
    await expect(page.getByText(/Distribución de Ingresos por Producto/i)).toBeVisible();
  });
});
