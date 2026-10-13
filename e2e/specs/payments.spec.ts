import { test, expect } from '@playwright/test';
import { signIn } from '../session';

test.describe('Cobros y Cuentas por Cobrar (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('Flujo completo: emisión con crédito, cobro total, cobro parcial, límite de crédito, anulación y vista de impresión', async ({
    page,
  }) => {
    const timestamp = Date.now().toString().slice(-6);
    const sku = `PROD-P${timestamp}`;
    const productName = `Material Industrial ${timestamp}`;
    const productPrice = '50.00';

    // ── 1. Crear producto con existencia ─────────────────────────────────────
    await page.goto('/products/new');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.locator('input[name="sku"]').fill(sku);
    await page.locator('input[name="name"]').fill(productName);
    await page.locator('input[name="price"]').fill(productPrice);
    await page.locator('input[name="unit"]').fill('und');
    await page.locator('input[name="initialStock"]').fill('100');

    await page.getByRole('button', { name: /guardar|save/i }).click();
    await page.waitForURL(/\/products(\?|$)/);

    // ── 2. Crear Cliente con Límite de Crédito de $500 ────────────────────────
    await page.goto('/customers/new');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const customerName = `Inversiones El Sol ${timestamp}`;
    await page.locator('input[name="name"]').fill(customerName);
    await page.locator('input[name="creditLimit"]').fill('500.00');

    await page.getByRole('button', { name: /guardar|save/i }).click();
    await page.waitForURL(/\/customers(\?|$)/);

    // Obtener la fila del cliente y entrar a su ficha
    const customerRow = page.getByRole('row').filter({ hasText: customerName });
    await expect(customerRow).toBeVisible();
    await customerRow.getByRole('link', { name: /ver|view/i }).click();
    await page.waitForURL(/\/customers\/[^/]+/);

    // Verificar que en su ficha el saldo inicial sea $0.00 y el límite $500.00
    await expect(page.getByText('$ 0,00').or(page.getByText('$ 0.00'))).toBeVisible();
    await expect(page.getByText('$ 500,00').or(page.getByText('$ 500.00'))).toBeVisible();

    // ── 3. Emitir Nota de Entrega de 2 unidades ($100 + 16% IVA = $116.00) ────
    await page.goto('/delivery-notes/new');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const customerSelect = page.locator('#customerId');
    const customerOption = customerSelect.locator('option').filter({ hasText: customerName });
    const customerVal = await customerOption.getAttribute('value');
    if (!customerVal) throw new Error(`Cliente ${customerName} no encontrado`);
    await customerSelect.selectOption(customerVal);

    const productSelect = page.locator('select[name="line-product"]').first();
    const productOption = productSelect.locator('option').filter({ hasText: sku });
    const productVal = await productOption.getAttribute('value');
    if (!productVal) throw new Error(`Producto ${sku} no encontrado`);
    await productSelect.selectOption(productVal);

    await page.locator('input[name="line-quantity"]').first().fill('2');
    await page.getByRole('button', { name: /emitir|issue/i }).click();
    await page.waitForURL(/\/delivery-notes(\?|$)/);

    // Confirmar que la nota NE-XXXXXX fue creada
    const noteCreatedStatus = page.getByRole('status').filter({ hasText: /NE-\d+/ });
    await expect(noteCreatedStatus).toBeVisible();

    // ── 4. Comprobar que en la ficha del cliente aparece el saldo pendiente ──
    await page.goto('/customers');
    const customerRowAfterNote = page.getByRole('row').filter({ hasText: customerName });
    await customerRowAfterNote.getByRole('link', { name: /ver|view/i }).click();
    await page.waitForURL(/\/customers\/[^/]+/);

    // El saldo ahora debe reflejar $116.00
    await expect(page.getByText('$ 116,00').or(page.getByText('$ 116.00')).first()).toBeVisible();
    // Y el botón "Registrar cobro" o "Cobrar" debe estar disponible
    const payBtn = page.getByRole('link', { name: /cobrar|register payment/i }).first();
    await expect(payBtn).toBeVisible();

    // ── 5. Registrar Cobro Total ─────────────────────────────────────────────
    await payBtn.click();
    await page.waitForURL(/\/payments\/new/);

    // Debe mostrar la nota pendiente con saldo de 116.00
    await expect(page.getByText(/NE-\d+/).first()).toBeVisible();

    // Pulsar "Max" para imputar el saldo completo de la nota
    await page.getByRole('button', { name: /max/i }).first().click();

    // Indicar referencia
    await page.locator('input[name="reference"]').fill('TRANSF-987654');

    // Registrar cobro
    await page.getByRole('button', { name: /registrar cobro|record payment/i }).click();
    await page.waitForURL(/\/payments(\?|$)/);

    // Debe mostrar aviso de éxito con el correlativo REC-XXXXXX
    const paymentCreatedStatus = page.getByRole('status').filter({ hasText: /REC-\d+/ });
    await expect(paymentCreatedStatus).toBeVisible();

    // El cobro debe aparecer en el listado de cobros con estado "Aplicado"
    const paymentRow = page.getByRole('row').filter({ hasText: customerName }).first();
    await expect(paymentRow).toBeVisible();
    await expect(paymentRow).toContainText(/aplicado|applied/i);
    await expect(paymentRow).toContainText('116');

    // ── 6. Verificar Ficha del Cliente tras Cobro Total ──────────────────────
    await page.goto('/customers');
    const customerRowPaid = page.getByRole('row').filter({ hasText: customerName });
    await customerRowPaid.getByRole('link', { name: /ver|view/i }).click();
    await page.waitForURL(/\/customers\/[^/]+/);

    // El saldo pendiente debe volver a ser $0.00
    await expect(page.getByText('$ 0,00').or(page.getByText('$ 0.00')).first()).toBeVisible();
    await expect(page.getByText(/el cliente está al día|zero pending balance/i)).toBeVisible();

    // ── 7. Cobro Parcial: Emitir otra nota de 2 unidades ($116.00) ───────────
    await page.goto('/delivery-notes/new');
    await customerSelect.selectOption(customerVal);
    await productSelect.selectOption(productVal);
    await page.locator('input[name="line-quantity"]').first().fill('2');
    await page.getByRole('button', { name: /emitir|issue/i }).click();
    await page.waitForURL(/\/delivery-notes(\?|$)/);

    // Ir a registrar cobro parcial de $50.00
    await page.goto(`/payments/new?customerId=${customerVal}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Asignar 50.00 a la nota y al monto total
    await page.locator('input[name="amount"]').fill('50.00');
    await page.locator('input[name="allocation-amount"]').first().fill('50.00');
    await page.locator('input[name="reference"]').fill('PAGO-MOVIL-001');

    await page.getByRole('button', { name: /registrar cobro|record payment/i }).click();
    await page.waitForURL(/\/payments(\?|$)/);

    // En la ficha del cliente, el saldo pendiente debe ser ahora $66.00 ($116 - $50)
    await page.goto('/customers');
    const customerRowPartial = page.getByRole('row').filter({ hasText: customerName });
    await customerRowPartial.getByRole('link', { name: /ver|view/i }).click();
    await page.waitForURL(/\/customers\/[^/]+/);

    await expect(page.getByText('$ 66,00').or(page.getByText('$ 66.00')).first()).toBeVisible();

    // En la tabla de notas pendientes, debe mostrar Cobrado: $50.00 y Saldo: $66.00
    const pendingNoteRow = page
      .getByRole('row')
      .filter({ hasText: /NE-\d+/ })
      .first();
    await expect(pendingNoteRow).toContainText(/50[.,]00/);
    await expect(pendingNoteRow).toContainText(/66[.,]00/);

    // ── 8. Detalle del Cobro y Anulación ──────────────────────────────────────
    await page.goto('/payments');
    const partialPaymentLink = page
      .getByRole('row')
      .filter({ hasText: 'PAGO-MOVIL-001' })
      .getByRole('link')
      .first();
    await partialPaymentLink.click();
    await page.waitForURL(/\/payments\/[^/]+/);

    // Comprobar datos en la pantalla de detalle
    await expect(page.getByText('$ 50,00').or(page.getByText('$ 50.00')).first()).toBeVisible();
    await expect(page.getByText('PAGO-MOVIL-001')).toBeVisible();

    // Probar vista de impresión
    const printLink = page.getByRole('link', { name: /imprimir|print/i });
    await expect(printLink).toBeVisible();
    await printLink.click();
    await page.waitForURL(/\/payments\/[^/]+\/print/);

    // Verificar contenido de la vista de impresión
    await expect(page.getByText(/recibo de cobro/i).first()).toBeVisible();
    await expect(page.getByText(/sin valor fiscal/i).first()).toBeVisible();

    // Volver al detalle del cobro
    await page.getByRole('link', { name: /volver|back/i }).click();
    await page.waitForURL(/\/payments\/[^/]+$/);

    // Anular el cobro parcial indicando motivo
    await page.locator('input[name="reason"]').fill('Pago móvil no liquidado en cuenta');
    await page.getByRole('button', { name: /anular cobro|void payment/i }).click();

    // El cobro debe cambiar a estado "Anulado" y mostrar el motivo
    await expect(page.getByText(/anulado|voided/i).first()).toBeVisible();
    await expect(page.getByText(/Pago móvil no liquidado en cuenta/i)).toBeVisible();

    // Verificar que en la ficha del cliente el saldo se RESTAURÓ a $116.00
    await page.goto('/customers');
    const customerRowRestored = page.getByRole('row').filter({ hasText: customerName });
    await customerRowRestored.getByRole('link', { name: /ver|view/i }).click();
    await page.waitForURL(/\/customers\/[^/]+/);

    await expect(page.getByText('$ 116,00').or(page.getByText('$ 116.00')).first()).toBeVisible();
  });

  test('Límite de crédito estricto: bloquea ventas que lo superen y se desbloquea tras el cobro', async ({
    page,
  }) => {
    const timestamp = Date.now().toString().slice(-6);
    const sku = `PROD-L${timestamp}`;
    const productName = `Insumo Límite ${timestamp}`;
    const productPrice = '40.00'; // $40 + 16% = $46.40

    // Crear producto
    await page.goto('/products/new');
    await page.locator('input[name="sku"]').fill(sku);
    await page.locator('input[name="name"]').fill(productName);
    await page.locator('input[name="price"]').fill(productPrice);
    await page.locator('input[name="initialStock"]').fill('50');
    await page.getByRole('button', { name: /guardar|save/i }).click();
    await page.waitForURL(/\/products(\?|$)/);

    // Crear cliente con límite estricto de $60.00
    await page.goto('/customers/new');
    const customerName = `Cliente Crédito Justo ${timestamp}`;
    await page.locator('input[name="name"]').fill(customerName);
    await page.locator('input[name="creditLimit"]').fill('60.00');
    await page.getByRole('button', { name: /guardar|save/i }).click();
    await page.waitForURL(/\/customers(\?|$)/);

    // 1ª venta: 1 unidad ($46.40 <= $60.00) -> DEBE PASAR
    await page.goto('/delivery-notes/new');
    const customerSelect = page.locator('#customerId');
    const customerOption = customerSelect.locator('option').filter({ hasText: customerName });
    const customerVal = await customerOption.getAttribute('value');
    if (!customerVal) throw new Error(`Cliente ${customerName} no encontrado`);
    await customerSelect.selectOption(customerVal);

    const productSelect = page.locator('select[name="line-product"]').first();
    const productOption = productSelect.locator('option').filter({ hasText: sku });
    const productVal = await productOption.getAttribute('value');
    if (!productVal) throw new Error(`Producto ${sku} no encontrado`);
    await productSelect.selectOption(productVal);

    await page.locator('input[name="line-quantity"]').first().fill('1');
    await page.getByRole('button', { name: /emitir|issue/i }).click();
    await page.waitForURL(/\/delivery-notes(\?|$)/);

    // 2ª venta: 1 unidad ($46.40 + $46.40 = $92.80 > $60.00) -> DEBE BLOQUEARSE
    await page.goto('/delivery-notes/new');
    await customerSelect.selectOption(customerVal);
    await productSelect.selectOption(productVal);
    await page.locator('input[name="line-quantity"]').first().fill('1');
    await page.getByRole('button', { name: /emitir|issue/i }).click();

    // Debe mostrar error de límite de crédito excedido
    await expect(page.getByText(/supera el límite de crédito|credit limit/i).first()).toBeVisible();

    // Pagar la 1ª venta completa
    await page.goto(`/payments/new?customerId=${customerVal}`);
    await page.getByRole('button', { name: /max/i }).first().click();
    await page.getByRole('button', { name: /registrar cobro|record payment/i }).click();
    await page.waitForURL(/\/payments(\?|$)/);

    // Con el saldo liberado a $0, intentar la 2ª venta nuevamente -> AHORA SÍ PASA
    await page.goto('/delivery-notes/new');
    await customerSelect.selectOption(customerVal);
    await productSelect.selectOption(productVal);
    await page.locator('input[name="line-quantity"]').first().fill('1');
    await page.getByRole('button', { name: /emitir|issue/i }).click();
    await page.waitForURL(/\/delivery-notes(\?|$)/);

    const secondNoteStatus = page.getByRole('status').filter({ hasText: /NE-\d+/ });
    await expect(secondNoteStatus).toBeVisible();
  });

  test('Cobro multi-imputación: salda múltiples notas pendientes en un solo recibo usando "Pagar todas" y verifica detalle y saldos', async ({
    page,
  }) => {
    const timestamp = Date.now().toString().slice(-6);
    const sku = `PROD-M${timestamp}`;
    const productName = `Insumo Lote M ${timestamp}`;
    const productPrice = '25.00'; // $25 + 16% = $29.00

    // 1. Crear producto
    await page.goto('/products/new');
    await page.locator('input[name="sku"]').fill(sku);
    await page.locator('input[name="name"]').fill(productName);
    await page.locator('input[name="price"]').fill(productPrice);
    await page.locator('input[name="initialStock"]').fill('100');
    await page.getByRole('button', { name: /guardar|save/i }).click();
    await page.waitForURL(/\/products(\?|$)/);

    // 2. Crear Cliente con Límite de $500
    await page.goto('/customers/new');
    const customerName = `Corporación MultiPago ${timestamp}`;
    await page.locator('input[name="name"]').fill(customerName);
    await page.locator('input[name="creditLimit"]').fill('500.00');
    await page.getByRole('button', { name: /guardar|save/i }).click();
    await page.waitForURL(/\/customers(\?|$)/);

    // Obtener customerId
    const customerRow = page.getByRole('row').filter({ hasText: customerName });
    await customerRow.getByRole('link', { name: /ver|view/i }).click();
    await page.waitForURL(/\/customers\/([^/]+)/);
    const customerUrl = page.url();
    const customerId = customerUrl.split('/customers/')[1]?.split('?')[0];

    // 3. Emitir Nota 1 (1 unidad = $29.00)
    await page.goto('/delivery-notes/new');
    const customerSelect = page.locator('#customerId');
    if (!customerId) throw new Error('Customer ID missing');
    await customerSelect.selectOption(customerId);
    const productSelect = page.locator('select[name="line-product"]').first();
    const productOption = productSelect.locator('option').filter({ hasText: sku });
    const productVal = await productOption.getAttribute('value');
    if (!productVal) throw new Error(`Producto ${sku} no encontrado`);
    await productSelect.selectOption(productVal);
    await page.locator('input[name="line-quantity"]').first().fill('1');
    await page.getByRole('button', { name: /emitir|issue/i }).click();
    await page.waitForURL(/\/delivery-notes(\?|$)/);

    // 4. Emitir Nota 2 (2 unidades = $58.00)
    await page.goto('/delivery-notes/new');
    await customerSelect.selectOption(customerId);
    await productSelect.selectOption(productVal);
    await page.locator('input[name="line-quantity"]').first().fill('2');
    await page.getByRole('button', { name: /emitir|issue/i }).click();
    await page.waitForURL(/\/delivery-notes(\?|$)/);

    // 5. Ir a ficha del cliente y comprobar saldo total acumulado = $87.00
    await page.goto(`/customers/${customerId}`);
    await expect(page.getByText('$ 87,00').or(page.getByText('$ 87.00')).first()).toBeVisible();

    // 6. Ir al formulario de cobro
    await page
      .getByRole('link', { name: /cobrar|register payment/i })
      .first()
      .click();
    await page.waitForURL(/\/payments\/new/);

    // Deben haber 2 filas de notas pendientes
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(2);

    // 7. Pulsar "Imputar todo"
    await page.getByRole('button', { name: /imputar todo|allocate all|pay all/i }).click();

    // Verificar que el monto total se actualizó a 87.00
    await expect(page.locator('input[name="amount"]')).toHaveValue('87.00');

    // Indicar referencia
    await page.locator('input[name="reference"]').fill('TRANSF-MULTI-01');

    // Registrar cobro
    await page.getByRole('button', { name: /registrar cobro|record payment/i }).click();
    await page.waitForURL(/\/payments(\?|$)/);

    // Debe mostrar aviso de éxito con REC-XXXXXX
    await expect(page.getByRole('status').filter({ hasText: /REC-\d+/ })).toBeVisible();

    // 8. Entrar al detalle del cobro y verificar que ambas notas están imputadas
    const paymentRow = page.getByRole('row').filter({ hasText: 'TRANSF-MULTI-01' }).first();
    await paymentRow.getByRole('link').first().click();
    await page.waitForURL(/\/payments\/[^/]+$/);

    await expect(page.getByText('$ 87,00').or(page.getByText('$ 87.00')).first()).toBeVisible();
    await expect(page.getByText('TRANSF-MULTI-01')).toBeVisible();

    // Comprobar que en la tabla de imputaciones están ambas notas ($29 y $58)
    await expect(page.getByText('$ 29,00').or(page.getByText('$ 29.00')).first()).toBeVisible();
    await expect(page.getByText('$ 58,00').or(page.getByText('$ 58.00')).first()).toBeVisible();

    // 9. Volver a la ficha del cliente y verificar deuda en $0
    await page.goto(`/customers/${customerId}`);
    await expect(page.getByText('$ 0,00').or(page.getByText('$ 0.00')).first()).toBeVisible();
    await expect(page.getByText(/el cliente está al día|zero pending balance/i)).toBeVisible();
  });

  test('Reglas de integridad: impide reducir límite de crédito por debajo del saldo pendiente y valida motivo de anulación', async ({
    page,
  }) => {
    const timestamp = Date.now().toString().slice(-6);
    const sku = `PROD-I${timestamp}`;
    const productName = `Insumo Integridad ${timestamp}`;
    const productPrice = '50.00'; // $50 + 16% = $58.00

    // 1. Crear producto
    await page.goto('/products/new');
    await page.locator('input[name="sku"]').fill(sku);
    await page.locator('input[name="name"]').fill(productName);
    await page.locator('input[name="price"]').fill(productPrice);
    await page.locator('input[name="initialStock"]').fill('50');
    await page.getByRole('button', { name: /guardar|save/i }).click();
    await page.waitForURL(/\/products(\?|$)/);

    // 2. Crear Cliente con Límite de $200.00
    await page.goto('/customers/new');
    const customerName = `Cliente Control Deuda ${timestamp}`;
    await page.locator('input[name="name"]').fill(customerName);
    await page.locator('input[name="creditLimit"]').fill('200.00');
    await page.getByRole('button', { name: /guardar|save/i }).click();
    await page.waitForURL(/\/customers(\?|$)/);

    // Obtener ID
    const customerRow = page.getByRole('row').filter({ hasText: customerName });
    await customerRow.getByRole('link', { name: /ver|view/i }).click();
    await page.waitForURL(/\/customers\/([^/]+)/);
    const customerUrl = page.url();
    const customerId = customerUrl.split('/customers/')[1]?.split('?')[0];

    // 3. Emitir Nota de Entrega de 1 unidad ($58.00)
    await page.goto('/delivery-notes/new');
    const customerSelect = page.locator('#customerId');
    if (!customerId) throw new Error('Customer ID missing');
    await customerSelect.selectOption(customerId);
    const productSelect = page.locator('select[name="line-product"]').first();
    const productOption = productSelect.locator('option').filter({ hasText: sku });
    const productVal = await productOption.getAttribute('value');
    if (!productVal) throw new Error(`Producto ${sku} no encontrado`);
    await productSelect.selectOption(productVal);
    await page.locator('input[name="line-quantity"]').first().fill('1');
    await page.getByRole('button', { name: /emitir|issue/i }).click();
    await page.waitForURL(/\/delivery-notes(\?|$)/);

    // 4. Intentar bajar el límite de crédito a $30.00 (< saldo pendiente de $58.00)
    await page.goto(`/customers/${customerId}/edit`);
    await page.locator('input[name="creditLimit"]').fill('30.00');
    await page.getByRole('button', { name: /guardar|save/i }).click();

    // Debe mostrar error de regla de negocio CreditLimitBelowBalance
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(
      page.getByText(/no puede quedar por debajo del saldo pendiente|CreditLimitBelowBalance/i),
    ).toBeVisible();

    // 5. Cobrar la nota completa
    await page.goto(`/payments/new?customerId=${customerId}`);
    await page.getByRole('button', { name: /max/i }).first().click();
    await page.locator('input[name="reference"]').fill('VALID-01');
    await page.getByRole('button', { name: /registrar cobro|record payment/i }).click();
    await page.waitForURL(/\/payments(\?|$)/);

    // 6. Entrar al detalle del cobro y probar anulación con motivo inválido (<3 caracteres)
    const paymentRow = page.getByRole('row').filter({ hasText: 'VALID-01' }).first();
    await paymentRow.getByRole('link').first().click();
    await page.waitForURL(/\/payments\/[^/]+$/);

    // Motivo corto
    await page.locator('input[name="reason"]').fill('no');
    await page.getByRole('button', { name: /anular cobro|void payment/i }).click();

    // Debe seguir en estado Aplicado y no haber navegado
    await expect(page.getByText(/aplicado|applied/i).first()).toBeVisible();

    // Motivo válido
    await page.locator('input[name="reason"]').fill('Reverso solicitado por cliente');
    await page.getByRole('button', { name: /anular cobro|void payment/i }).click();

    // Ahora sí queda anulado
    await expect(page.getByText(/anulado|voided/i).first()).toBeVisible();
  });
});
