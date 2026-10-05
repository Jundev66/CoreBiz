import { can, type Actor, type Permission, type Role } from '@corebiz/domain';

/**
 * The instructions the model receives before every conversation.
 *
 * Written in Spanish because that is what the people using CoreBiz speak, and a model
 * answers in the language it was briefed in more reliably than in the one it was told to use.
 *
 * What it says about data is the important part: in this phase the assistant sees NO company
 * data. Without saying so, a model asked "how much did I sell today?" invents a number, and
 * an invented number inside an ERP is worse than no assistant at all.
 */

interface Screen {
  readonly path: string;
  readonly name: string;
  readonly what: string;
  readonly needs?: Permission;
}

/**
 * The screens the model may send people to. `apps/api/test/assistant-screens.test.ts` fails
 * when one of these paths stops having a page.
 */
export const ASSISTANT_SCREENS: readonly Screen[] = [
  {
    path: '/',
    name: 'Inicio',
    what: 'resumen del día: ventas recientes, productos con stock bajo y accesos rápidos.',
  },
  {
    path: '/customers',
    name: 'Clientes',
    what: 'alta y edición de clientes, RIF, límite de crédito, saldo pendiente y archivado.',
    needs: 'customer:read',
  },
  {
    path: '/products',
    name: 'Productos',
    what: 'catálogo con SKU, precio, costo, existencias, stock mínimo y ajustes de inventario con su historial de movimientos.',
    needs: 'product:read',
  },
  {
    path: '/delivery-notes',
    name: 'Notas de entrega',
    what: 'emitir notas (descuentan stock y congelan la tasa de cambio del día), marcarlas como entregadas, anularlas (devuelven el stock) e imprimirlas.',
    needs: 'delivery_note:read',
  },
  {
    path: '/purchases',
    name: 'Compras',
    what: 'recepciones de mercancía de proveedores (suman stock) y su anulación; los proveedores están en Compras › Proveedores.',
    needs: 'purchase:read',
  },
  {
    path: '/reports',
    name: 'Reportes',
    what: 'ventas por período y exportación.',
    needs: 'report:read',
  },
  {
    path: '/settings',
    name: 'Ajustes',
    what: 'datos de la empresa: nombre y porcentaje del impuesto informativo, moneda principal y tasa de cambio.',
  },
  {
    path: '/settings/team',
    name: 'Ajustes › Equipo',
    what: 'invitar personas, cambiar su rol o quitarles el acceso.',
    needs: 'user:read',
  },
  {
    path: '/settings/audit',
    name: 'Ajustes › Actividad',
    what: 'registro de auditoría: quién hizo qué y cuándo.',
    needs: 'audit:read',
  },
  {
    path: '/settings/ai',
    name: 'Ajustes › Inteligencia artificial',
    what: 'conectar el asistente a Ollama, Claude, Gemini o un servicio compatible con OpenAI.',
    needs: 'ai:configure',
  },
];

const ROLE_NAMES: Readonly<Record<Role, string>> = {
  owner: 'Dueño',
  admin: 'Administrador',
  sales: 'Ventas',
  warehouse: 'Almacén',
  viewer: 'Solo lectura',
};

export function assistantSystemPrompt(
  actor: Actor,
  errorContext?: { readonly kind: string; readonly incidentId?: string | null | undefined } | null,
): string {
  const visible = ASSISTANT_SCREENS.filter((s) => s.needs === undefined || can(actor, s.needs));
  const screens = visible.map((s) => `- ${s.name} (${s.path}): ${s.what}`).join('\n');

  let errorNotice = '';
  if (errorContext?.kind) {
    errorNotice = `\n\nAlerta de error o validación reciente en pantalla:
- Código de Regla: ${errorContext.kind}${errorContext.incidentId ? ` (Referencia de soporte: ${errorContext.incidentId})` : ''}
Si la persona pregunta sobre este fallo, explícale con empatía la causa a nivel de negocio y cómo resolverlo con los pasos y pantallas autorizadas.
Privacidad y Ciberseguridad: No expongas consultas SQL ni detalles técnicos internos.`;
  }

  return `Eres el asistente de ayuda de CoreBiz, un ERP para comercios pequeños (clientes, productos e inventario, notas de entrega, compras y reportes, en USD y VES).

Tu trabajo es explicar cómo usar el sistema y llevar a la persona a la pantalla correcta.

Reglas:
- NO tienes acceso a los datos de la empresa: no ves clientes, productos, ventas, saldos ni existencias. Si te preguntan por una cifra o un registro concreto, dilo con claridad y explica en qué pantalla lo puede consultar. Nunca inventes números, nombres ni documentos.
- No puedes hacer acciones en el sistema. Explica los pasos para que la persona las haga.
- La persona tiene el rol "${ROLE_NAMES[actor.role]}". Solo recomienda pantallas de esta lista, que son las que puede abrir; si lo que pide requiere otro rol, dile que se lo pida a un dueño o administrador.
- El impuesto de CoreBiz es informativo: no des asesoría fiscal ni legal.
- Si no sabes algo, di "no lo sé" en lugar de suponer.
- Responde en español, breve y en pasos cuando sea un procedimiento. Menciona las pantallas por su nombre.

Pantallas disponibles para esta persona:
${screens}${errorNotice}`;
}
