/**
 * Compras.
 *
 * Cierra el ciclo del inventario: comprar -> stock -> vender. La entrada de
 * mercancia SUMA generando movimientos, exactamente igual que la emision de una
 * nota de entrega RESTA generandolos. Reutiliza el libro mayor que ya existe en
 * `Product` en lugar de tocar el saldo por su cuenta.
 *
 * Alcance deliberado: `Supplier` y `GoodsReceipt`. La ORDEN DE COMPRA —el
 * documento de "voy a pedir esto" con su propia maquina de estados y sus
 * recepciones parciales— queda fuera y esta anotada en docs/ROADMAP.md. Para un
 * comercio pequeno, lo que mueve el negocio es registrar lo que LLEGO; la orden
 * previa es un flujo de empresas con departamento de compras.
 */
export * from './supplier';
export * from './goods-receipt';
