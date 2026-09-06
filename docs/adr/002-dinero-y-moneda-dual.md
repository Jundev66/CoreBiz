# ADR 002 — Dinero en bigint y moneda dual USD/Bs con tasa congelada

- **Estado**: aceptada
- **Fecha**: 2026-09-06

## Contexto

El comercio venezolano opera de facto en dólares y liquida en bolívares. Todo documento
necesita ambas cifras, y la tasa de cambio se mueve constantemente.

## Decisión

### 1. Los importes son `bigint` en unidades menores

Nunca `number`, nunca `float`. Los totales de un ERP se suman miles de veces y
`0.1 + 0.2 !== 0.3` en coma flotante. `bigint` da aritmética exacta y de precisión
arbitraria, que es justo lo que hace falta cuando los totales en bolívares alcanzan los
billones.

### 2. Cada documento guarda un snapshot inmutable de la tasa

`ExchangeRate` lleva `capturedAt` obligatorio y no expone ningún método que la mute. Al
emitir una nota de entrega, la tasa vigente queda congelada dentro del documento.

Esto no es un detalle cosmético. Si al reimprimir un documento de hace seis meses se
recalculara con la tasa de hoy, la aplicación estaría **reescribiendo el histórico contable
del negocio** cada vez que alguien abre un PDF antiguo.

### 3. El impuesto es informativo

Configurable por tenant (`tax_label`, `tax_rate_bp`), se presenta como monto informativo y
jamás como tributo declarado. Sin alícuotas múltiples, sin exenciones por categoría, sin
retenciones: eso es complejidad tributaria real y queda deliberadamente fuera del alcance.

## Consecuencias

- Los repositorios mapean `bigint` explícitamente en ambas direcciones. `postgres.js`
  devuelve `numeric` como _string_, así que el mapeo tiene que ser explícito o aparecen
  errores de precisión silenciosos.
- `Money.allocate()` reparte importes sin perder céntimos: 100 entre 3 da
  33,34 + 33,33 + 33,33, y la suma de las partes es exactamente el total original.
- Se acepta la coma decimal en la entrada ("25,50"), porque es lo que un usuario escribe
  allí de forma natural. Los separadores de millares se rechazan: son ambiguos entre
  configuraciones regionales, y un error explícito es mejor que un importe mal leído.
- Los tests de propiedades (fast-check) verifican que repartir siempre conserva el total y
  que el viaje de ida y vuelta por la serialización no pierde precisión.
