# CoreBiz SDD (Spec-Driven Development) Board

All future work on the `feature/multi-country-modular-architecture` branch follows strict **Spec-Driven Development (SDD)**:

1. **Spec First**: A detailed markdown ticket with domain models, invariants, acceptance criteria (Given/When/Then), and test plans must be written and approved before touching production code.
2. **Hexagonal Boundaries**: Implementation must adhere to Single Package per Context with `./domain`, `./application`, and `./infrastructure` subpath exports.
3. **Double-Entry Invariant**: Debit == Credit enforced across all accounting transactions.
4. **Zero Comments Policy**: Code is 100% self-documenting with intention-revealing names and Value Objects.
5. **OpSec Anti-Attribution**: 100% generic synthetic demo data.

---

## Ticket Roster & Roadmap

| Ticket ID                                                                                                | Context / Feature  | Scope                                                                                                   | Status        |
| :------------------------------------------------------------------------------------------------------- | :----------------- | :------------------------------------------------------------------------------------------------------ | :------------ |
| **[TICKET-001](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-001-fiscal-bounded-context.md)**              | `fiscal`           | Extract `@corebiz/fiscal` bounded context package (`./domain`, `./infrastructure`)                      | **COMPLETED** |
| **[TICKET-002](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-002-accounting-bounded-context.md)**          | `accounting`       | Extract `@corebiz/accounting` bounded context package (`./domain`, `./application`, `./infrastructure`) | **COMPLETED** |
| **[TICKET-003](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-003-invoicing-bounded-context.md)**           | `invoicing`        | Extract `@corebiz/invoicing` bounded context package (`./domain`, `./application`, `./infrastructure`)  | **COMPLETED** |
| **[TICKET-004](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-004-adaptive-pos-multicountry.md)**           | `pos`              | Country-aware POS behavior (VE tax/IGTF vs US Sales Tax) & offline sync                                 | **COMPLETED** |
| **[TICKET-005](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-005-synthetic-seeders-legal-shield.md)**      | `platform`         | Multi-country demo seeders (VE & US) and legal terms / cookie disclaimer                                | **COMPLETED** |
| **[TICKET-006](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-006-external-integrations-api.md)**           | `integrations`     | Headless REST API (`/v1/integrations`) with API keys, idempotency, and balanced double-entry accounting | **COMPLETED** |
| **[TICKET-007](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-007-multi-tenant-rbac.md)**                   | `access`           | Multi-company & multi-user RBAC engine with PostgreSQL RLS isolation                                    | **COMPLETED** |
| **[TICKET-008](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-008-multi-tenant-switching-api.md)**          | `access`           | Multi-company tenant switching API (`/v1/access/tenants`) with cross-jurisdiction discovery             | **COMPLETED** |
| **[TICKET-009](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-009-granular-account-determination.md)**      | `invoicing`        | Two-tier account determination (Item override + Company fallback) with multi-account revenue splitting  | **COMPLETED** |
| **[TICKET-010](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-010-accounting-invoicing-web-experience.md)** | `accounting`/`web` | Full Accounting & Invoicing web experience (Chart of Accounts, Trial Balance, Ledger, Invoices)         | **COMPLETED** |
| **[TICKET-011](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-011-statutory-fiscal-books-reporting.md)**    | `fiscal`           | Statutory Fiscal Books & Tax Reports (VE Libro de Ventas/Compras SENIAT & US Sales Tax Summary)         | **COMPLETED** |
| **[TICKET-012](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-012-bank-reconciliation-cash-flow.md)**       | `accounting`       | Bank Reconciliation Engine (Statement import, automated matching, and balanced bank adjustments)        | **COMPLETED** |
| **[TICKET-013](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-013-multicurrency-forex-revaluation.md)**     | `accounting`       | Multi-Currency Foreign Exchange Revaluation & Unrealized Gain/Loss Journal Postings (NIIF / US GAAP)    | **COMPLETED** |
| **[TICKET-014](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-014-fiscal-printer-hardware-abstraction.md)** | `fiscal`/`pos`     | Fiscal Printer & Digital Billing Abstraction (`FiscalPrinterPort`, HKA Protocol, Reporte Z/X, ESC/POS)  | **COMPLETED** |
| **[TICKET-015](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-015-treasury-crypto-asset-swaps.md)**         | `accounting`       | Treasury Swaps & Crypto/Foreign Exchange Asset Acquisition (USD / USDT / VES and P2P fee isolation)     | **COMPLETED** |
| **[TICKET-016](file:///D:/Dev/CoreBiz/plans/tickets/TICKET-016-partner-drawings-owner-consumption.md)**  | `accounting`/`pos` | Partner Drawings & Owner Traceability (Cash withdrawals, inventory self-consumption, partner accounts)  | **COMPLETED** |
