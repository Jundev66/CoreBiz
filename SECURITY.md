# Política de seguridad

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Un issue es visible para todo el mundo desde el primer
minuto, y describir un fallo sin arreglar es entregarlo.

Usa el reporte privado de GitHub: pestaña **Security → Report a vulnerability** de este
repositorio. Incluye, si puedes:

- qué componente se ve afectado (`apps/web`, `apps/api`, migraciones SQL, despliegue);
- el impacto: qué puede leer, escribir o tumbar quien lo explote;
- los pasos mínimos para reproducirlo contra un entorno **local** (`pnpm db:start`).

**No pruebes contra la demostración pública** ni contra datos de terceros. Todo el sistema
se levanta en local con datos sembrados, y es ahí donde hay que reproducir cualquier cosa.

## Qué esperar

- Acuse de recibo en unos días.
- Si se confirma, el arreglo se publica antes que la descripción del fallo.
- Crédito en la nota del arreglo si lo quieres.

## Alcance

El modelo de amenazas, con lo que está mitigado y lo que no, está en
[`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). Lo que ya figura ahí como riesgo aceptado o
pendiente no necesita reporte, aunque una forma nueva de explotarlo sí.
