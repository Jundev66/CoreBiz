import type { ErpActorContext, ErpBridgePort } from './ports';
import type { ErpErrorContext } from './types';
import { sanitizeErrorContext, sanitizeUserQuery } from './security';

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
 * Structured business error guide. Explains to the user in plain language:
 * 1. Why it happened (causa de negocio clara y comprensible).
 * 2. What to do (pasos accionables y seguros para resolverlo).
 * 3. Direct navigation action to resolve it without technical leakage.
 */
export interface BusinessErrorGuide {
  readonly kind: string;
  readonly title: string;
  readonly why: string;
  readonly whatToDo: readonly string[];
  readonly targetPath?: string;
  readonly actions?: readonly SynapseAction[];
  readonly keywords: readonly string[];
}

export const BUSINESS_ERROR_GUIDES: readonly BusinessErrorGuide[] = [
  {
    kind: 'EmailAlreadyRegistered',
    title: 'Correo ya registrado en la plataforma',
    why: 'Ya existe una cuenta activa asociada a esta dirección de correo electrónico. Por seguridad de acceso y unicidad, el sistema no permite registros duplicados con el mismo correo.',
    whatToDo: [
      'Inicia sesión directamente con ese correo en la pantalla de acceso.',
      'Si no recuerdas la contraseña, pulsa en "¿Olvidaste tu contraseña?" para restablecerla de forma segura.',
      'Si estabas invitando a un nuevo miembro al equipo, confirma su correo o pídele que inicie sesión.',
    ],
    targetPath: '/login',
    actions: [{ label: 'Ir a Iniciar Sesión', href: '/login' }],
    keywords: [
      'correo ya existente',
      'correo existente',
      'correo ya registrado',
      'email already registered',
      'email existente',
      'correo duplicado',
      'email ya registrado',
      'email ya existe',
      'cuenta ya existe',
    ],
  },
  {
    kind: 'InvalidCredentials',
    title: 'Credenciales de acceso incorrectas',
    why: 'El correo electrónico o la contraseña ingresados no coinciden con las cuentas registradas en el sistema.',
    whatToDo: [
      'Verifica que el correo no contenga espacios accidentales o faltas ortográficas.',
      'Asegúrate de que la tecla Bloq Mayús no esté activada.',
      'Si olvidaste tu clave, utiliza el enlace para restablecer contraseña.',
    ],
    targetPath: '/login',
    actions: [{ label: 'Ir a Iniciar Sesión', href: '/login' }],
    keywords: [
      'credenciales invalidas',
      'credenciales incorrectas',
      'invalid credentials',
      'clave incorrecta',
      'contraseña incorrecta',
    ],
  },
  {
    kind: 'InsufficientStock',
    title: 'Existencias o stock insuficiente en inventario',
    why: 'Estás intentando despachar o facturar más unidades de las que existen registradas físicamente en almacén. El sistema bloquea existencias negativas para proteger la contabilidad y el inventario.',
    whatToDo: [
      'Registra primero la recepción de compra del proveedor desde el módulo de Compras para cargar stock.',
      'Si la mercancía ya está en tienda pero no se ha contabilizado, realiza un ajuste manual de inventario desde la ficha del producto.',
      'O disminuye la cantidad solicitada en la línea de la nota de entrega.',
    ],
    targetPath: '/products',
    actions: [
      { label: 'Ir a Productos', href: '/products' },
      { label: 'Ir a Compras', href: '/purchases' },
    ],
    keywords: [
      'stock insuficiente',
      'sin stock',
      'no hay stock',
      'insufficient stock',
      'falta stock',
      'inventario insuficiente',
      'existencias insuficientes',
      'no alcanza el stock',
    ],
  },
  {
    kind: 'CreditLimitExceeded',
    title: 'Límite de crédito comercial excedido',
    why: 'Esta operación dejaría la deuda acumulada del cliente por encima del cupo de crédito máximo autorizado para su cuenta.',
    whatToDo: [
      'Registra un cobro parcial o total de las notas de entrega pendientes de este cliente para liberar saldo disponible.',
      'O solicita a un administrador que aumente su límite de crédito desde la ficha del cliente.',
    ],
    targetPath: '/customers',
    actions: [{ label: 'Ver Clientes', href: '/customers' }],
    keywords: [
      'limite de credito',
      'límite de crédito',
      'credito excedido',
      'crédito excedido',
      'credit limit exceeded',
      'limite superado',
      'saldo de credito',
    ],
  },
  {
    kind: 'DuplicateSku',
    title: 'Código SKU ya registrado',
    why: 'Ya existe otro producto en tu catálogo con ese mismo código SKU. El SKU es el identificador único del ítem en almacén y no puede repetirse.',
    whatToDo: [
      'Asigna un código SKU distinto y único al producto que estás creando.',
      'Si el producto ya fue creado anteriormente, búscalo en el catálogo para actualizar sus existencias o precios.',
    ],
    targetPath: '/products',
    actions: [{ label: 'Ir a Productos', href: '/products' }],
    keywords: [
      'sku duplicado',
      'duplicate sku',
      'codigo duplicado',
      'código duplicado',
      'sku ya existe',
      'sku repetido',
    ],
  },
  {
    kind: 'DuplicateProduct',
    title: 'Producto repetido en el documento',
    why: 'El mismo producto aparece en más de un renglón del documento. La plataforma exige una sola línea consolidada por ítem.',
    whatToDo: [
      'Elimina el renglón duplicado.',
      'Suma las cantidades totales en una sola línea del producto.',
    ],
    targetPath: '/delivery-notes',
    actions: [{ label: 'Ver Notas de Entrega', href: '/delivery-notes' }],
    keywords: ['producto duplicado', 'duplicate product', 'producto repetido'],
  },
  {
    kind: 'StockNotTracked',
    title: 'Producto sin control de inventario',
    why: 'Este producto está marcado como servicio o bien sin existencias rastreables, por lo que no admite movimientos de entrada o salida de almacén.',
    whatToDo: [
      'Si requieres controlar existencias para este producto, edita su ficha en el catálogo y activa el seguimiento de stock.',
    ],
    targetPath: '/products',
    actions: [{ label: 'Ir a Productos', href: '/products' }],
    keywords: [
      'stock not tracked',
      'no lleva stock',
      'sin control de inventario',
      'no controla stock',
      'producto sin inventario',
    ],
  },
  {
    kind: 'NoExchangeRate',
    title: 'Sin tasa de cambio oficial configurada',
    why: 'Tu empresa trabaja con moneda dual (USD y VES) y no hay una tasa de cambio configurada en el sistema para calcular los importes.',
    whatToDo: [
      'Un administrador o dueño debe registrar la tasa oficial vigente en Ajustes antes de emitir documentos.',
    ],
    targetPath: '/settings',
    actions: [{ label: 'Ir a Ajustes', href: '/settings' }],
    keywords: [
      'no exchange rate',
      'sin tasa de cambio',
      'tasa de cambio',
      'falta tasa',
      'tasa del dia',
      'tasa de cambio no configurada',
    ],
  },
  {
    kind: 'Forbidden',
    title: 'Acción no autorizada para tu rol',
    why: 'Tu rol de usuario actual no incluye el permiso necesario para realizar esta acción. CoreBiz aplica control de acceso granular por rol.',
    whatToDo: [
      'Solicita a un administrador o propietario que realice la acción.',
      'O pide que ajusten los permisos de tu usuario desde Ajustes › Equipo si tu labor requiere esta función.',
    ],
    targetPath: '/settings/team',
    actions: [{ label: 'Ver Equipo', href: '/settings/team' }],
    keywords: [
      'forbidden',
      'no tengo permiso',
      'sin permisos',
      'permiso denegado',
      'no autorizado',
      'acceso restringido',
      'acceso denegado',
    ],
  },
  {
    kind: 'QuotaExceeded',
    title: 'Tope o cuota de plan alcanzada',
    why: 'Has llegado al límite máximo permitido por tu plan comercial para este recurso (número de productos, usuarios o capacidad).',
    whatToDo: [
      'Archiva registros o usuarios antiguos que ya no utilices (archivar conserva todo el historial intacto).',
      'O contacta a la administración de QuadraBiz / CoreBiz para ampliar la capacidad de tu plan.',
    ],
    keywords: [
      'quota exceeded',
      'cuota excedida',
      'limite alcanzado',
      'tope alcanzado',
      'limite de plan',
      'tope de plan',
    ],
  },
  {
    kind: 'AlreadyVoided',
    title: 'Documento o entrada ya anulada',
    why: 'Este registro ya fue anulado previamente. El sistema no permite anular dos veces porque duplicaría la devolución de inventario.',
    whatToDo: ['Recarga la página para verificar el estado actualizado del documento.'],
    targetPath: '/delivery-notes',
    actions: [{ label: 'Ver Notas de Entrega', href: '/delivery-notes' }],
    keywords: ['already voided', 'ya anulado', 'documento anulado', 'anulado previamente'],
  },
  {
    kind: 'InvalidTransition',
    title: 'Transición de estado no válida',
    why: 'El documento ya no está en el estado requerido para esta acción (por ejemplo, ya fue entregado o modificado por otro usuario en simultáneo).',
    whatToDo: ['Actualiza la pantalla para visualizar el estado vigente del documento.'],
    targetPath: '/delivery-notes',
    actions: [{ label: 'Ver Notas de Entrega', href: '/delivery-notes' }],
    keywords: [
      'invalid transition',
      'transicion invalida',
      'estado no valido',
      'cambio de estado invalido',
    ],
  },
  {
    kind: 'TooManyAttempts',
    title: 'Protección contra intentos reiterados',
    why: 'Se registraron demasiados intentos seguidos en poco tiempo y el sistema activó una protección temporal contra ataques de fuerza bruta.',
    whatToDo: [
      'Espera 1 minuto sin realizar peticiones.',
      'Reintenta nuevamente con calma ingresando los datos correctos.',
    ],
    keywords: ['too many attempts', 'demasiados intentos', 'bloqueo temporal', 'espera un momento'],
  },
  {
    kind: 'Unexpected',
    title: 'Excepción del servidor protegida',
    why: 'Se produjo un fallo inesperado en el servidor. Por estrictos principios de ciberseguridad, los detalles técnicos internos (tablas de BD o trazas) se mantienen aislados y protegidos.',
    whatToDo: [
      'Anota el código de referencia (ej: INC-XXXXXXXX) si el sistema te lo muestra.',
      'Repórtalo a soporte técnico para que ubiquen el incidente exacto en los logs sin comprometer tu información.',
    ],
    keywords: [
      'error 500',
      'unexpected',
      'error inesperado',
      'se ha roto',
      'incidente',
      'fallo del servidor',
      'excepcion',
    ],
  },
  {
    kind: 'CustomerNotFound',
    title: 'Cliente no encontrado o archivado',
    why: 'El cliente solicitado no existe, fue archivado o el enlace utilizado está desactualizado.',
    whatToDo: [
      'Búscalo en la lista de clientes.',
      'Activa la casilla "Ver también los archivados" si sospechas que fue archivado con anterioridad.',
    ],
    targetPath: '/customers',
    actions: [{ label: 'Ir a Clientes', href: '/customers' }],
    keywords: ['cliente no encontrado', 'customer not found', 'no existe cliente'],
  },
  {
    kind: 'ProductNotFound',
    title: 'Producto no encontrado o archivado',
    why: 'El producto buscado no existe, fue archivado o el identificador es erróneo.',
    whatToDo: ['Búscalo en el catálogo de productos y verifica los filtros de archivados.'],
    targetPath: '/products',
    actions: [{ label: 'Ir a Productos', href: '/products' }],
    keywords: ['producto no encontrado', 'product not found', 'no existe producto'],
  },
];

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
      'Errores y validaciones: consulta por qué el sistema bloquea alguna acción.',
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
 * Formats a BusinessErrorGuide into a structured, cybersecurity-safe user reply.
 */
export function formatErrorGuideReply(
  guide: BusinessErrorGuide,
  incidentId?: string | null,
): DeterministicReply {
  const stepsFormatted = guide.whatToDo.map((step, i) => `${i + 1}. ${step}`).join('\n');
  const incidentSection = incidentId
    ? `\n\n📌 **Código de Referencia de Soporte:** \`${incidentId}\` *(Compártelo con soporte para revisar los registros protegidos)*`
    : '';

  const replyText =
    `⚠️ **Diagnóstico de Validación: ${guide.title}** (Modo Local sin IA)\n\n` +
    `🛑 **¿Por qué pasa?**\n${guide.why}\n\n` +
    `💡 **¿Qué debes hacer?**\n${stepsFormatted}` +
    incidentSection +
    `\n\n🔒 *Ciberseguridad y Privacidad: Tu información y datos técnicos internos se mantienen aislados y protegidos.*`;

  return {
    reply: replyText,
    ...(guide.targetPath !== undefined ? { suggestedPath: guide.targetPath } : {}),
    ...(guide.actions !== undefined ? { actions: guide.actions } : {}),
    mode: 'deterministic',
  };
}

/**
 * Motor determinista sin IA de Synapse.
 * Evalúa las capacidades autorizadas del ERP, las guías operativas y los diagnósticos de errores.
 */
export async function executeDeterministicQuery(
  erp: ErpBridgePort,
  actor: ErpActorContext,
  query: string,
  errorContext?: ErpErrorContext | null,
): Promise<DeterministicReply> {
  const sanitizedQuery = sanitizeUserQuery(query);
  const normalized = sanitizedQuery.toLowerCase().trim();
  const safeErrorContext = sanitizeErrorContext(errorContext);
  const capabilities = await erp.getAvailableCapabilities(actor);

  // 1. Diagnóstico de Error Activo (si se proporciona un errorContext y el usuario pregunta o pulsa para explicarlo)
  const isAskingAboutActiveError =
    safeErrorContext !== null &&
    (normalized === '' ||
      normalized.includes('error') ||
      normalized.includes('falló') ||
      normalized.includes('fallo') ||
      normalized.includes('por qué') ||
      normalized.includes('porque') ||
      normalized.includes('qué pasó') ||
      normalized.includes('que paso') ||
      normalized.includes('explicar') ||
      normalized.includes('explica') ||
      normalized.includes('ayuda') ||
      normalized.includes('problema') ||
      normalized.includes('validación') ||
      normalized.includes('validacion') ||
      normalized.includes(safeErrorContext.kind.toLowerCase()));

  if (safeErrorContext !== null && isAskingAboutActiveError) {
    const matchedError = BUSINESS_ERROR_GUIDES.find(
      (g) => g.kind.toLowerCase() === safeErrorContext.kind.toLowerCase(),
    );

    if (matchedError) {
      return formatErrorGuideReply(matchedError, safeErrorContext.incidentId);
    }

    // Fallback seguro para error desconocido no mapeado sin revelar trazas internas
    return {
      reply:
        `⚠️ **Diagnóstico de Validación: ${safeErrorContext.kind}** (Modo Local sin IA)\n\n` +
        `🛑 **¿Por qué pasa?**\nEl sistema activó una regla de negocio o validación de seguridad (${safeErrorContext.kind}) que impidió completar la operación.\n\n` +
        `💡 **¿Qué debes hacer?**\n` +
        `1. Revisa los datos introducidos en el formulario y confirma que cumplan los requisitos.\n` +
        `2. Si el problema persiste, actualiza la pantalla.\n` +
        (safeErrorContext.incidentId
          ? `3. Si necesitas soporte técnico, proporciona el código de referencia: \`${safeErrorContext.incidentId}\`.\n\n`
          : '\n') +
        `🔒 *Ciberseguridad: Ningún dato confidencial ni estructura de base de datos ha sido expuesta.*`,
      mode: 'deterministic',
    };
  }

  // 2. Consulta sobre errores específicos de negocio (e.g. "correo ya existente", "stock insuficiente", etc.)
  const matchedErrorGuide = BUSINESS_ERROR_GUIDES.find(
    (g) =>
      g.keywords.some((kw) => normalized.includes(kw)) || normalized.includes(g.kind.toLowerCase()),
  );

  if (matchedErrorGuide) {
    return formatErrorGuideReply(matchedErrorGuide);
  }

  // 3. Consulta general sobre catálogo de errores o validaciones
  if (
    normalized.includes('guía de errores') ||
    normalized.includes('guia de errores') ||
    normalized.includes('por qué fallan las validaciones') ||
    normalized.includes('diagnostico de errores') ||
    normalized.includes('diagnóstico de errores') ||
    normalized === 'errores' ||
    normalized === 'validaciones'
  ) {
    const errorHighlights = BUSINESS_ERROR_GUIDES.slice(0, 5)
      .map((g) => `• **${g.title}:** ${g.why.slice(0, 100)}...`)
      .join('\n\n');

    return {
      reply:
        `🛡️ **Centro de Diagnóstico y Validaciones del Sistema** (Modo Local sin IA)\n\n` +
        `CoreBiz aplica reglas de validación para proteger la integridad de tus finanzas e inventario. Algunos motivos comunes:\n\n` +
        `${errorHighlights}\n\n` +
        `💡 *Puedes preguntarme directamente sobre cualquiera de ellos (ej: "¿Por qué sale correo ya existente?", "¿Qué hago con stock insuficiente?") y te explicaré la solución paso a paso.*`,
      mode: 'deterministic',
    };
  }

  // 4. Intent match con guías operativas comunes
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

  // 5. Intent match con módulos/pantallas autorizadas del ERP
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

  // 6. Fallback inteligente listando las áreas disponibles para el usuario
  const availableList = capabilities.map((c) => `• **${c.name}** (${c.path})`).join('\n');
  const fallbackActions = capabilities
    .filter((c) => c.path !== '/')
    .slice(0, 4)
    .map((c) => ({ label: c.name, href: c.path }));

  return {
    reply: `🤖 **Asistente Operativo Synapse** (Modo Local sin IA)\n\nPuedes consultarme sobre las siguientes áreas autorizadas para tu rol (${actor.roleName}):\n\n${availableList || '• Consultas operativas'}\n\nPrueba escribiendo por ejemplo: *"clientes"*, *"cómo crear un producto"*, *"ventas"*, *"correo ya existente"* o *"stock insuficiente"*.`,
    ...(fallbackActions.length > 0 ? { actions: fallbackActions } : {}),
    mode: 'deterministic',
  };
}
