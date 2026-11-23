# CoreBiz: Futuros Rasgos y Roadmap Arquitectónico Enterprise

## 1. Visión General

Este documento formaliza el roadmap de características y arquitectura a largo plazo para CoreBiz, evolucionando el sistema de un ERP estándar hacia una plataforma financiera, contable y fiscal internacional, multi-empresa, multi-país y _headless_ para integraciones de terceros.

---

## 2. Núcleo Multi-Moneda Universal

- **Monedas Soportadas Iniciales**: `USD` (Dólar estadounidense), `VES` (Bolívar venezolano) y `EUR` (Euro).
- **Exactitud Matemática**:
  - Montos transaccionales y saldos: Representados mediante enteros escalados `bigint` (centavos/minor units) para eliminar cualquier riesgo de coma flotante.
  - Tasa Cambiaria Oficial (BCV / FX): Congelada con **8 decimales** (`RATE_SCALE = 8`), garantizando que la conversión de grandes volúmenes no pierda fracciones de céntimo.
  - Cantidades de Inventario: 3 decimales (`QUANTITY_SCALE = 3`) para fracciones físicas (kilos, gramos, litros).
- **Invariante de Tasa Histórica**: Todo documento emitido congela la tasa de cambio vigente en el instante exacto de su emisión (`capturedAt`). Las consultas históricas jamás recalculan con tasas actuales.

---

## 3. Motor Fiscal Multi-País (`FiscalJurisdictionPort`)

La plataforma selecciona la estrategia fiscal según el país asignado al tenant (`fiscal_country: "VE" | "US"`):

### 3.1. Jurisdicción Venezuela (`VE`)

- **Identificador Fiscal**: RIF validado algorítmicamente mediante Módulo 11 (V, J, G, E, C).
- **Régimen Impositivo**:
  - IVA: Alicuota general (16%), reducida (8%), exenta (0%).
  - IGTF: 3% aplicado sobre pagos efectuados en moneda extranjera o criptoactivos no soberanos.
- **Marco Legal SENIAT (2026)**:
  - Providencia SNAT/2026/00084 (G.O. 43.435): Eliminación de homologación obligatoria de software.
  - Providencia SNAT/2026/00093 (G.O. 43.484): Desregulación de impresoras fiscales exclusivas; habilitación de Proveedores de Facturación Electrónica e Imprentas Digitales autorizadas.
- **Catálogo Contable**: Adaptado al estándar VEN-NIF (`1.1.01.01.001`).
- **Libros Legales**: Libro de Ventas y Libro de Compras fiscales con columnas específicas de base imponible, exento, IVA retenido e IGTF.

### 3.2. Jurisdicción Estados Unidos (`US`)

- **Identificador Fiscal**: EIN federal validado (`XX-XXXXXXX`).
- **Régimen Impositivo**:
  - Sales Tax por jurisdicción destino (Estado, Condado, Ciudad).
  - Cero IVA nacional.
  - Gestión de certificados de exención (Resale certificates).
- **Catálogo Contable**: Adaptado al estándar US GAAP (`1000 Assets`, `2000 Liabilities`, `3000 Equity`, `4000 Revenue`, `5000 COGS`, `6000 Expenses`).
- **Reportes Legales**: Trazabilidad de pagos a contratistas para emisión de formularios 1099-NEC / 1099-MISC.

---

## 4. Comportamiento Adaptativo del Punto de Venta (POS)

La aplicación `apps/pos` (Vite SPA offline-first) adapta dinámicamente su pantalla de cobro según el país de la empresa activa:

- **Flujo Venezuela**:
  - Desglose en pantalla de precios duales (USD de referencia y VES a tasa oficial BCV).
  - Pregunta obligatoria del medio de pago en el checkout: si el cliente paga en divisas/efectivo USD, calcula automáticamente el 3% de IGTF sobre el monto recibido.
  - Emisión de ticket fiscal con RIF del cliente y Número de Control fiscal.
- **Flujo Estados Unidos**:
  - Precios de lista netos en USD.
  - Cálculo automático del Sales Tax combinado según la dirección o código postal del local.
  - Emisión de recibo formal con desglose de Sales Tax y EIN de la empresa.

---

## 5. Multi-Empresa, Multi-Usuario y Roles (N:M con PostgreSQL RLS)

- **Modelo de Membresía**: Un usuario (`users`) puede fundar o ser invitado a múltiples empresas (`tenants`).
- **Aislamiento Estricto por RLS**: Toda consulta a nivel de base de datos exige la inyección de `SET LOCAL app.current_tenant_id = :tenant_id`, impidiendo fugas entre empresas a nivel de motor SQL.
- **Matriz de Control de Acceso Basada en Roles (RBAC)**:
  - `owner`: Control total, gestión de suscripción, transferencia de titularidad y borrado.
  - `admin`: Configuración contable, creación de usuarios, gestión fiscal y auditoría.
  - `sales`: Emisión de presupuestos, facturas, cobros y consulta de catálogo.
  - `warehouse`: Recepción de mercancía, despacho físico y ajustes de inventario.
  - `viewer`: Solo lectura de informes y balance de comprobación.

---

## 6. Plataforma Headless para Integraciones de Terceros

CoreBiz expone un adaptador primario REST en `/v1/integrations` para sistemas externos de ventas o e-commerce que carecen de motor fiscal/contable propio:

- **Autenticación**: Cabecera `x-api-key` vinculada a la empresa y máquina autorizada.
- **Idempotencia Obligatoria**: Cabecera `Idempotency-Key` en toda solicitud de emisión o cobro. La red puede reintentar sin duplicar facturas ni asientos.
- **Generación Automática de Partida Doble**: La API externa solo envía los productos y montos; el motor de CoreBiz genera el asiento contable balanceado ($\sum \text{Débitos} \equiv \sum \text{Créditos}$) de manera atómica dentro de la misma transacción.

---

## 7. Blindaje Legal, OpSec y Datos de Demostración

Para proteger la plataforma ante reclutadores, evaluadores o usuarios exploratorios, evitando contingencias o demandas:

- **OpSec Anti-Atribución (Hard Rule)**: Prohibido de forma absoluta utilizar nombres de personas reales, clientes o empresas existentes.
- **Seeders Duales 100% Sintéticos**:
  - `Empresa Demo Caracas C.A.` (RIF `J-12345678-9`, sede Caracas, moneda base USD, contabilidad VEN-NIF).
  - `Demo US Retail LLC` (EIN `12-3456789`, sede Delaware, moneda base USD, contabilidad US GAAP).
- **Aviso Legal y Banner Demo**: Todo usuario no autenticado o en modo demo visualiza en la cabecera:
  > _"Entorno de demostración y evaluación técnica. Toda la información comercial, fiscal y contable mostrada es 100% sintética y ficticia con fines exclusivamente educativos."_
- **Términos de Servicio y Política de Cookies**: Secciones legales estáticas y modal de aceptación durante el onboarding inicial.

---

## 8. Estrategia de Internacionalización (i18n)

- **Fase Actual**: Interfaz y mensajes completamente en Español neutro profesional (con soporte multi-país de reglas fiscales VE y US).
- **Fase Futura**: Selector de idioma dinámico (`es` / `en`) mediante catálogo de traducciones basado en claves semánticas (`errorKind` y tokens i18n), desacoplado de las respuestas de la API.
