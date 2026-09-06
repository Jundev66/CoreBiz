# ADR 003 — Notas de entrega en lugar de facturas fiscales

- **Estado**: aceptada
- **Fecha**: 2026-09-06

## Contexto

El negocio para el que se diseña CoreBiz no puede emitir documentos fiscales. Un sistema
que generase documentos con apariencia de comprobante fiscal crearía un problema legal real
para quien lo use.

## Decisión

El documento de venta es una **nota de entrega**: un documento interno, no fiscal, que
respalda la salida de mercancía y descuenta el inventario.

- Flujo: **Presupuesto → Nota de Entrega → Cobro**.
- Numeración correlativa **interna por tenant**, con prefijo configurable. Nada de
  numeración de control ni de vocabulario tributario.
- Estados: `borrador → emitida → entregada → anulada`. El stock se descuenta al emitir;
  anular genera movimientos compensatorios y **nunca** borra los originales, para que la
  trazabilidad del inventario quede intacta.
- Los cobros son un agregado aparte que referencia la nota. No existe un estado que sugiera
  cumplimiento tributario.
- Todo documento generado lleva impresa la leyenda _"Documento no fiscal / sin valor fiscal"_,
  y hay un test que verifica su presencia en la vista de impresión.

## Cumplimiento verificado

`scripts/check-non-fiscal.sh` corre en CI y falla si aparece vocabulario tributario en el
código del producto. Es un check barato que mantiene visible una frontera que, de otro modo,
se erosionaría con el tiempo: un nombre de variable, un texto de interfaz, una migración.

Los archivos de documentación quedan excluidos, porque su propósito es precisamente
explicar qué es lo que CoreBiz **no** hace.
