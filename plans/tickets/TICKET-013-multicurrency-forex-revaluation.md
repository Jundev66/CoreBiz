# SDD Specification: TICKET-013 — Multi-Currency Revaluation & Foreign Exchange Adjustment (Forex)

## 1. Context & Business Need

In multi-currency economies (e.g., Venezuela operating in USD and VES under BCV rates, or US enterprises holding foreign receivables/payables), monetary assets and liabilities denominated in foreign currencies fluctuate against the entity's functional currency.

According to international accounting standards (IAS 21 / ASC 830 / VEN-NIF):

1. **Closing Rate Valuation**: At the close of each financial reporting period, open foreign-currency monetary items (Cash & Bank holdings, Accounts Receivable, Accounts Payable) must be translated using the official closing spot exchange rate.
2. **Unrealized Gain / Loss Recognition**: Exchange differences resulting from translating monetary balances at rates different from those at which they were initially recognized must be recognized in the Statement of Profit or Loss (`Ganancia por Diferencia en Cambio` or `Pérdida por Diferencia en Cambio`).
3. **Double-Entry Invariant**: The generated revaluation journal entry must be strictly balanced ($\sum \text{Debits} \equiv \sum \text{Credits}$) with full auditability back to the originating invoices or bank balances.

## 2. Ubiquitous Language & Core Concepts

- **FunctionalCurrency**: Primary currency of the economic environment in which the tenant operates (VES for VE, USD for US).
- **MonetaryPosition**: Open balance of cash, receivables, or payables denominated in a foreign currency.
- **HistoricalBookValue**: Value of the monetary position recorded at the transaction date exchange rate.
- **RevaluedMarketValue**: Value of the monetary position evaluated at the official closing exchange rate.
- **UnrealizedForexDelta**: Mathematical difference between `RevaluedMarketValue` and `HistoricalBookValue`.

## 3. Architecture & File Structure

```text
packages/accounting/
  src/
    domain/
      model/
        forex-revaluation.ts             # Domain aggregate for forex adjustments
        monetary-position.ts             # Value object for open foreign balances
      port/
        exchange-rate.port.ts            # Central bank rate port (BCV / Fed)
    application/
      commands/
        run-forex-revaluation.command.ts # Execute period revaluation
      queries/
        get-forex-exposure.query.ts      # Query open currency exposure
packages/contracts/
  src/
    forex.ts                             # Schemas for revaluation requests
apps/api/
  src/
    modules/
      accounting/
        controllers/
          run-forex-revaluation.controller.ts
          get-forex-exposure.controller.ts
apps/web/
  app/(app)/
    accounting/
      forex/
        page.tsx                         # Multi-currency exposure & revaluation UI
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Accounts Receivable Revaluation with Forex Gain

- **Given** an open invoice of $1,000.00 USD originally booked when 1 USD = 36.00 VES (Book Value: 36,000.00 VES)
- **When** the closing BCV rate increases to 1 USD = 38.50 VES and `run-forex-revaluation` executes
- **Then** the new value is 38,500.00 VES and a balanced journal entry is posted:
  - Debit: Accounts Receivable for 2,500.00 VES
  - Credit: Ganancia en Cambio (`4.2.01`) for 2,500.00 VES
  - Total Debits (2,500.00 VES) strictly equal Total Credits (2,500.00 VES).

### Scenario 2: Zero Exposure on Fully Settled Invoices

- **Given** invoices where `remainingBalance === 0`
- **When** revaluation runs
- **Then** settled invoices are ignored, avoiding erroneous phantom adjustments.

## 5. Verification Checklist

- [ ] Implement `MonetaryPosition` and `ForexRevaluation` in `@corebiz/accounting`
- [ ] Implement `RunForexRevaluationCommandHandler` enforcing double-entry invariants
- [ ] Add contract schemas in `@corebiz/contracts`
- [ ] Expose REST controllers in `apps/api`
- [ ] Implement currency exposure view in `apps/web`
- [ ] Zero comments policy strictly respected
- [ ] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
