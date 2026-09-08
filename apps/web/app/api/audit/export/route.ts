import { apiForRequest } from '@/api/session';

/**
 * Exportacion del registro de auditoria a CSV.
 *
 * Es una ruta y no una Server Action porque devuelve un archivo, no una
 * pantalla. Y el gating del plan se aplica AQUI, en el unico sitio que produce
 * el archivo: si viviera en la visibilidad del enlace, escribir la URL a mano lo
 * descargaria igual. Lo mismo vale para el rol — la politica RLS de `audit_log`
 * ya devuelve cero filas a quien no sea owner o admin, pero se comprueba tambien
 * antes de generar nada.
 */
export async function GET(request: Request): Promise<Response> {
  const { ctx, queries } = await apiForRequest();

  if (ctx.actor.role !== 'owner' && ctx.actor.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  const gate = ctx.plan.checkFeature('audit_export');
  if (!gate.ok) {
    return Response.json(
      { error: 'FeatureNotAvailable', requiredPlan: gate.error.requiredPlan },
      { status: 402 },
    );
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const page = await queries.admin.auditLog({
    ...(action !== null && action !== '' ? { action } : {}),
    ...(from !== null && from !== '' ? { from: new Date(from) } : {}),
    ...(to !== null && to !== '' ? { to: new Date(`${to}T23:59:59.999Z`) } : {}),
    // Un tope alto pero acotado: sin limite, exportar el historico entero de un
    // tenant grande lo trae todo a memoria de una funcion serverless.
    limit: 5_000,
  });

  const header = ['fecha', 'actor', 'accion', 'entidad', 'identificador', 'detalle'];
  const rows = page.items.map((entry) => [
    entry.occurredAt.toISOString(),
    entry.actorEmail ?? '',
    entry.action,
    entry.entityType ?? '',
    entry.entityId ?? '',
    entry.summary === null ? '' : JSON.stringify(entry.summary),
  ]);

  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="auditoria-${ctx.tenantSlug}-${stamp}.csv"`,
      // Un export de auditoria no se cachea en ningun sitio: lleva quien hizo
      // que y cuando, y ademas cambia cada vez.
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Escapa un campo CSV.
 *
 * El prefijo con comilla simple ante `= + - @` no es paranoia: Excel y Calc
 * interpretan un campo que empieza por esos caracteres como una FORMULA, y un
 * `=HYPERLINK(...)` guardado en un campo de auditoria se ejecuta al abrir el
 * archivo. Se llama inyeccion de formulas CSV y es un vector real en cualquier
 * exportacion que incluya texto escrito por usuarios.
 */
function escapeCsv(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replaceAll('"', '""')}"`;
}
