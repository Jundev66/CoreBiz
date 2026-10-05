import type { ErpActorContext, ErpBridgePort } from './ports.ts';

export interface SynapseAction {
  readonly label: string;
  readonly href: string;
}

/**
 * Universal rule-based fallback and FAQ knowledge entry.
 * Can be provided by any ERP bridge.
 */
export interface ErpRuleGuide {
  readonly keywords: readonly string[];
  readonly title: string;
  readonly steps: readonly string[];
  readonly targetPath?: string;
  readonly actions?: readonly SynapseAction[];
}

/**
 * Common ERP operational guidelines that work across business management systems.
 */
const COMMON_ERP_GUIDES: readonly ErpRuleGuide[] = [
  {
    keywords: ['cliente', 'clientes', 'crear cliente', 'nuevo cliente'],
    title: 'Gestión de Clientes',
    steps: [
      'Ve a la sección o menú de Clientes.',
      'Pulsa en el botón para crear o registrar un nuevo cliente.',
      'Ingresa el código identificador, nombre o razón social y datos de contacto.',
      'Guarda el registro para que quede disponible en ventas.',
    ],
    targetPath: '/customers',
    actions: [
      { label: 'Ir a Clientes', href: '/customers' },
      { label: '+ Nuevo Cliente', href: '/customers/new' },
    ],
  },
  {
    keywords: ['producto', 'productos', 'catalogo', 'sku', 'crear producto'],
    title: 'Catálogo de Productos',
    steps: [
      'Ingresa al módulo de Productos o Inventario.',
      'Selecciona la opción de añadir producto.',
      'Establece el código único (SKU), descripción, costo de compra y precio de venta.',
      'Indica si el producto controla existencias en almacén.',
    ],
    targetPath: '/products',
    actions: [
      { label: 'Ir a Productos', href: '/products' },
      { label: '+ Nuevo Producto', href: '/products/new' },
    ],
  },
  {
    keywords: ['venta', 'ventas', 'nota de entrega', 'despacho', 'factura', 'emitir', 'albaran'], // no-fiscal-ok
    title: 'Ventas y Documentos de Salida',
    steps: [
      'Accede a Ventas o Notas de Entrega.',
      'Inicia una nueva emisión seleccionando el cliente destinatario.',
      'Agrega los productos indicando las cantidades correspondientes.',
      'Al emitir el documento, el stock de inventario se descuenta automáticamente.',
    ],
    targetPath: '/delivery-notes',
    actions: [
      { label: 'Ir a Ventas / Notas de Entrega', href: '/delivery-notes' },
      { label: '+ Nueva Nota de Entrega', href: '/delivery-notes/new' },
    ],
  },
  {
    keywords: ['compra', 'compras', 'recepcion', 'proveedor', 'proveedores', 'entrada'],
    title: 'Compras y Entrada de Mercancía',
    steps: [
      'Ve al módulo de Compras o Recepción de Mercancía.',
      'Selecciona el proveedor que despacha el pedido.',
      'Indica las cantidades y el costo unitario de los productos recibidos.',
      'Al registrar la recepción, el inventario aumentará en almacén.',
    ],
    targetPath: '/purchases',
    actions: [
      { label: 'Ir a Compras', href: '/purchases' },
      { label: 'Ver Proveedores', href: '/purchases/suppliers' },
      { label: '+ Nueva Recepción', href: '/purchases/new' },
    ],
  },
  {
    keywords: ['anular', 'anulacion', 'devolver', 'cancelar nota'],
    title: 'Anulación de Documentos',
    steps: [
      'Localiza el documento en su listado correspondiente.',
      'Ingresa al detalle del documento emitido.',
      'Selecciona la opción de anulación e introduce el motivo.',
      'El sistema compensará automáticamente los movimientos de stock.',
    ],
    targetPath: '/delivery-notes',
    actions: [{ label: 'Ver Notas de Entrega', href: '/delivery-notes' }],
  },
  {
    keywords: [
      'ayuda',
      'comandos',
      'que puedes hacer',
      'inicio',
      'hola',
      'menu',
      'menú',
      'volver',
      'menu principal',
      'opciones',
      'principal',
    ],
    title: 'Menú Principal de Opciones',
    steps: [
      'Selecciona una de las opciones rápidas o escribe lo que necesitas:',
      'Clientes: registro y directorio de clientes.',
      'Productos: catálogo, precios y control de inventario.',
      'Ventas: emisión y consulta de notas de entrega.',
      'Compras: recepción de mercancía y proveedores.',
    ],
    targetPath: '/',
    actions: [
      { label: 'Ir a Clientes', href: '/customers' },
      { label: 'Ir a Productos', href: '/products' },
      { label: 'Ir a Ventas', href: '/delivery-notes' },
      { label: 'Ir a Compras', href: '/purchases' },
    ],
  },
];

export interface DeterministicReply {
  readonly reply: string;
  readonly suggestedPath?: string;
  readonly actions?: readonly SynapseAction[];
  readonly mode: 'deterministic';
}

/**
 * Motor determinista sin IA de Synapse.
 * Evalúa las capacidades autorizadas del ERP y las guías operativas.
 */
export async function executeDeterministicQuery(
  erp: ErpBridgePort,
  actor: ErpActorContext,
  query: string,
): Promise<DeterministicReply> {
  const normalized = query.toLowerCase().trim();
  const capabilities = await erp.getAvailableCapabilities(actor);

  // 1. Intent match con guías operativas comunes (prioridad alta)
  const matchedGuide = COMMON_ERP_GUIDES.find((guide) =>
    guide.keywords.some((kw) => normalized.includes(kw)),
  );

  if (matchedGuide) {
    const stepsFormatted = matchedGuide.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
    const targetPath = matchedGuide.targetPath;
    const actions = matchedGuide.actions;

    return {
      reply: `📋 **${matchedGuide.title}** (Modo Local sin IA)\n\n${stepsFormatted}`,
      ...(targetPath !== undefined ? { suggestedPath: targetPath } : {}),
      ...(actions !== undefined ? { actions } : {}),
      mode: 'deterministic',
    };
  }

  // 2. Intent match con módulos/pantallas autorizadas del ERP
  const matchedScreen = capabilities.find(
    (c) =>
      normalized.includes(c.name.toLowerCase()) ||
      (c.path.length > 1 && normalized.includes(c.path.toLowerCase().replace('/', ''))),
  );

  if (matchedScreen) {
    return {
      reply: `📍 **Módulo: ${matchedScreen.name}**\n\n${matchedScreen.description}\n\nPuedes ingresar directamente a esta sección para gestionarlo.`,
      suggestedPath: matchedScreen.path,
      actions: [{ label: `Ir a ${matchedScreen.name}`, href: matchedScreen.path }],
      mode: 'deterministic',
    };
  }

  // 3. Fallback inteligente listando las áreas disponibles para el usuario
  const availableList = capabilities.map((c) => `• **${c.name}** (${c.path})`).join('\n');
  const fallbackActions = capabilities
    .filter((c) => c.path !== '/')
    .slice(0, 4)
    .map((c) => ({ label: c.name, href: c.path }));

  return {
    reply: `🤖 **Asistente Operativo Synapse** (Modo Local sin IA)\n\nPuedes consultarme sobre las siguientes áreas autorizadas para tu rol (${actor.roleName}):\n\n${availableList || '• Consultas operativas'}\n\nPrueba escribiendo por ejemplo: *"clientes"*, *"cómo crear un producto"*, *"ventas"* o *"compras"*.`,
    ...(fallbackActions.length > 0 ? { actions: fallbackActions } : {}),
    mode: 'deterministic',
  };
}
