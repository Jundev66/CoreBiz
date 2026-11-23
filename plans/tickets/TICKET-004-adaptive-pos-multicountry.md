# SDD Specification: TICKET-004 — Adaptive POS Multi-Country & Multi-Currency

## 1. Context & Business Need

CoreBiz's Point of Sale (`apps/pos`) is an offline-first Vite PWA powered by IndexedDB (Dexie) and background synchronization to the NestJS API. Historically, the POS hardcoded Venezuelan fiscal assumptions: 16% IVA, mandatory BCV dollar-to-bolívar conversion, Pago Móvil / Biopago payment methods, and SENIAT-style RIF receipts.

In a global multi-country architecture, the POS must adapt its behavior dynamically according to the tenant's jurisdiction (`country = 'VE' | 'US'`) and base currency (`USD` | `VES`):

- **Venezuela (`VE`)**: Dual-currency display (USD and VES with shift exchange rate), 16.00% IVA calculation, payment methods (`cash_usd`, `cash_ves`, `pago_movil`, `punto_debito`, `biopago`), customer RIF validation, and fiscal receipt breakdown.
- **United States (`US`)**: Single-currency display (USD, without BCV rates or Bolívares conversion), configurable Sales Tax (default 7.00% / exempt), US payment methods (`cash_usd`, `card`, `check`, `digital_wallet`), customer EIN/Tax ID validation, and US GAAP sales receipt format.
- **Dynamic Extensibility**: Support switching jurisdiction or configuring custom tax rates and store headers locally in IndexedDB config, remaining 100% operational offline without network access.

## 2. Ubiquitous Language & Core Concepts

- **PosJurisdiction**: `'VE'` | `'US'`. Determines tax rules, currency presentation, and receipt format.
- **PosCountryConfig**: Immutable configuration object containing:
  - `jurisdiction`: `'VE'` | `'US'`
  - `defaultCurrency`: `'USD'` | `'VES'`
  - `taxRateBp`: Tax rate in basis points (e.g. `1600` for 16.00% IVA in VE, `700` for 7.00% Sales Tax in US)
  - `taxLabel`: Label displayed in cart and receipt (e.g. `'IVA (16%)'` vs `'Sales Tax (7%)'`)
  - `taxIdLabel`: Customer tax identifier label (e.g. `'RIF / C.I.'` vs `'EIN / Tax ID'`)
  - `isDualCurrency`: Boolean indicating whether foreign exchange conversion lines should be displayed and calculated (true for VE, false for US).
  - `paymentMethods`: Available payment tender options in checkout.
  - `receiptHeader`: Company name, tax ID, and address for receipt rendering.
- **Adaptive Cart Totals**: Dynamic calculation using `taxRateBp` from active jurisdiction configuration rather than hardcoded 1600n.
- **Adaptive Receipt Formatter**: Renders clean, self-contained HTML receipts tailored to the jurisdiction (VE: dual-currency breakdown, RIF, exchange rate; US: sales receipt, EIN, single-currency total).

## 3. Architecture & File Structure

```text
apps/pos/
  src/
    config/
      pos-jurisdiction.ts     # PosJurisdiction, PosCountryConfig, getJurisdictionConfig
    db.ts                     # LocalConfig typed keys, LocalSale country field
    receipt.ts                # Adaptive receipt formatter supporting VE and US
    use-pos.ts                # Dynamic taxRateBp, jurisdiction state, adaptive cart totals
    App.tsx                   # Dynamic payment tender buttons, dual currency guard, country badge
  tests/
    pos-jurisdiction.test.ts  # Verification of VE vs US config contracts
    pos-adaptive.test.ts      # Cart calculations and receipt formatting for VE and US
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Venezuelan Jurisdiction Defaults

- **Given** POS is configured with jurisdiction `'VE'`
- **When** items totaling $100.00 USD are added to the cart
- **Then** tax is calculated at 16.00% ($16.00 USD), total is $116.00 USD, dual-currency bolívar equivalent is calculated using active exchange rate, and Venezuelan payment methods are offered.

### Scenario 2: United States Jurisdiction Defaults

- **Given** POS is configured with jurisdiction `'US'`
- **When** items totaling $100.00 USD are added to the cart
- **Then** tax is calculated at 7.00% ($7.00 USD), total is $107.00 USD, no bolívar/BCV conversion is displayed, and US payment methods (Cash, Card, Check, Digital Wallet) are offered.

### Scenario 3: Adaptive Receipt Generation for United States

- **Given** a completed sale in jurisdiction `'US'`
- **When** `formatReceiptHtml` is invoked
- **Then** the output receipt contains US header (`SALES RECEIPT`, `EIN: 12-3456789`), shows `Sales Tax`, and contains zero references to BCV, VES, or RIF.

### Scenario 4: Adaptive Receipt Generation for Venezuela

- **Given** a completed sale in jurisdiction `'VE'`
- **When** `formatReceiptHtml` is invoked
- **Then** the output receipt contains Venezuelan header (`COMPROBANTE DE ENTREGA`, `RIF`), shows `IVA`, and displays total in both USD and VES with exchange rate.

### Scenario 5: Offline State Persistence

- **Given** a change of jurisdiction in offline mode
- **When** the preference is saved
- **Then** it is persisted to IndexedDB `posDb.config` (`jurisdiction`, `tax_rate_bp`), and reloaded immediately upon offline restarts.

## 5. Verification Checklist

- [x] Create `apps/pos/src/config/pos-jurisdiction.ts` defining `PosJurisdiction` and `PosCountryConfig`
- [x] Adapt `apps/pos/src/use-pos.ts` to consume dynamic tax rates and country config from IndexedDB
- [x] Adapt `apps/pos/src/receipt.ts` to generate tailored receipts for VE and US
- [x] Update `apps/pos/src/App.tsx` with country selector, adaptive checkout payment tenders, and conditional dual-currency display
- [x] Provide comprehensive unit tests in `apps/pos/src/pos-adaptive.test.ts`
- [x] Zero comments in all source and test files
- [x] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
