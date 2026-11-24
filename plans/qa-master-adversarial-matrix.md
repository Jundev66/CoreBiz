# CoreBiz Senior QA Master Adversarial Test Matrix

## 1. Executive Summary & Quality Strategy

This QA Master Plan establishes the adversarial verification framework for CoreBiz across all 16 architecture and feature tickets (TICKET-001 through TICKET-016).

As a Senior QA Architect, testing is not merely verifying nominal "happy path" requirements. Our mission is to proactively attempt to break the financial, fiscal, multi-tenant, and concurrency invariants of the system across 4 rigorous tiers of testing:

- **Tier 1 (Happy Path)**: Standard nominal flows satisfying acceptance criteria, verifying UI assertions, calculations, and balanced double-entry ledger entries.
- **Tier 2 (Boundary & Input Resilience)**: Extreme monetary figures, zero amounts, negative prices/quantities, precision/rounding limits, invalid tax identifiers (RIF/EIN), malformed dates, and code injection boundaries.
- **Tier 3 (Zero-Leakage Multi-Tenant Isolation & Role Switching)**: Asserting Tenant B cannot access or leak Tenant A records via route navigation or parameter tampering; RBAC verification ensuring restricted roles (e.g. Cashier, Viewer) cannot execute administrative or financial mutations.
- **Tier 4 (Chaos, Financial Exploits & Idempotency)**: Concurrent submissions, rapid double-clicks (asserting `Idempotency-Key` headers prevent duplicate charges or journal entries), mid-mutation page reloads, and absolute double-entry invariant verification ($\sum \text{Debits} \equiv \sum \text{Credits}$).

---

## 2. Universal Financial & Architectural Invariants

Every test scenario in this matrix validates one or more inviolable system invariants:

1. **Double-Entry Balance Invariant**: In any monetary transaction, $\sum \text{Debits} \equiv \sum \text{Credits}$ to the exact integer minor unit (cent/céntimo). Unbalanced postings are rejected by domain validation before touching storage.
2. **Multi-Tenant RLS & Zero Leakage**: All read and write models require tenant context validation. Data from Tenant A (`018e245a-0000-7000-8000-000000000001`) must never appear in queries, reports, or screens executed by Tenant B (`018e245a-0000-7000-8000-000000000002`).
3. **Idempotency & At-Most-Once Execution**: Mutating API calls presenting the same `Idempotency-Key` must execute at most once. Replays return the exact original payload with zero duplicate financial entries.
4. **Zero Comments Policy**: No comments (`//`, `/* */`, `#`) in production or test source files.
5. **Zero External Access**: Execution restricted strictly to local environment (`localhost:3210`, `127.0.0.1:3211`).
6. **OpSec Anti-Attribution**: 100% synthetic fictitious demo data (`Empresa Demo C.A.`, `Cliente de Prueba 01`, RIF `J-12345678-9`).

---

## 3. Comprehensive Ticket Test Matrix (TICKET-001 through TICKET-016)

### TICKET-001: Fiscal Bounded Context (`@corebiz/fiscal`)

- **Scope**: Multi-country fiscal calculation engine (`FiscalJurisdictionPort`, `VenezuelaFiscalEngine`, `UnitedStatesFiscalEngine`).
- **Tier 1 (Happy Path)**:
  - VE: Given a subtotal of $100.00 USD at BCV rate 50.00 VES/USD, calculate 16% IVA ($16.00 / 800.00 VES) and 3% IGTF on foreign currency ($3.00 / 150.00 VES). Total = $119.00 USD.
  - US: Given a subtotal of $100.00 USD in Miami FL, calculate 7% Sales Tax ($7.00). Total = $107.00 USD.
- **Tier 2 (Boundary & Input Resilience)**:
  - Submit zero subtotal ($0.00) -> Tax amounts must be exactly zero, no NaN or division-by-zero.
  - Submit fractional cents ($10.555) -> Assert bankers rounding to integer minor units ($10.56).
  - Submit invalid RIF format (`Z-99999999-9`) or malformed EIN -> Reject with domain validation error.
- **Tier 3 (Multi-Tenant & Jurisdiction Isolation)**:
  - Ensure VE fiscal engine cannot be called with US tenant settings without throwing `UnsupportedJurisdictionException`.
  - Assert tax rates and fiscal configuration are scoped strictly per tenant.
- **Tier 4 (Chaos & Precision)**:
  - Run 1,000 randomized monetary calculations with rapid currency conversion; assert sum of tax breakdown lines equals total tax without penny leakage.

### TICKET-002: Accounting Bounded Context (`@corebiz/accounting`)

- **Scope**: Double-entry ledger, Chart of Accounts, Journal Entries, Trial Balance.
- **Tier 1 (Happy Path)**:
  - Create standard Journal Entry (Debit Cash $100, Credit Revenue $100). Post entry -> Status becomes `POSTED`.
  - Query Trial Balance -> Sum of Debits == Sum of Credits, Net Difference == 0.
- **Tier 2 (Boundary & Monetary Integrity)**:
  - Attempt to post unbalanced Journal Entry (Debit $100, Credit $99.99) -> Reject immediately with `UnbalancedJournalEntryException`.
  - Attempt to post zero-line Journal Entry -> Reject with validation error.
  - Attempt to post negative amount line -> Reject; debits and credits must be non-negative Money instances.
- **Tier 3 (Multi-Tenant Isolation & RBAC)**:
  - Post Journal Entry under Tenant A. Query Trial Balance under Tenant B -> Tenant B balance shows zero entries from Tenant A.
  - User with role `cashier` or `viewer` attempting `POST /v1/accounting/journal-entries` receives `403 Forbidden`.
- **Tier 4 (Chaos & Concurrency)**:
  - Rapid double-submission of Journal Entry creation with identical payload -> Verify database transaction isolation prevents phantom ledger line creation.

### TICKET-003: Invoicing Bounded Context (`@corebiz/invoicing`)

- **Scope**: Commercial invoice lifecycle (`DRAFT` -> `ISSUED` -> `PARTIALLY_PAID` -> `PAID` / `VOID`).
- **Tier 1 (Happy Path)**:
  - Create invoice with 2 items -> Issue invoice -> Status = `ISSUED`.
  - Register 50% partial payment -> Status = `PARTIALLY_PAID`, remaining balance = 50%.
  - Register remaining 50% payment -> Status = `PAID`, remaining balance = 0.
- **Tier 2 (Boundary & Resilience)**:
  - Attempt payment exceeding total invoice balance ($120 on $100 invoice) -> Reject with `PaymentExceedsBalanceException`.
  - Attempt to issue invoice with empty lines or negative unit price -> Reject with domain validation error.
  - Attempt to void an invoice that is already `PAID` -> Reject with illegal state transition error.
- **Tier 3 (Multi-Tenant Isolation)**:
  - Tenant A creates invoice #INV-001. Tenant B navigates to `/invoicing` -> INV-001 is completely invisible.
  - Direct GET by ID from Tenant B returns 404 Not Found.
- **Tier 4 (Chaos & Race Conditions)**:
  - Fire two simultaneous payment requests for 100% of invoice balance -> Only one succeeds; the second is rejected or absorbs 0, preventing negative balances.

### TICKET-004: Adaptive POS Multi-Country (`apps/pos`)

- **Scope**: Country-adaptive retail cashier interface with offline sync.
- **Tier 1 (Happy Path)**:
  - In VE mode: Add product $10, calculate 16% IVA + 3% IGTF for cash USD. Pay and emit ticket.
  - In US mode: Add product $10, calculate state/county sales tax. Pay via Card.
- **Tier 2 (Boundary & Offline Resilience)**:
  - Cut network connectivity (offline simulation) -> Transact 5 POS sales -> Stored locally in IndexedDB with `synced: false`.
  - Restore connectivity -> Assert sync engine pushes sales to backend and marks `synced: true` without data loss.
- **Tier 3 (Multi-Tenant POS Partitioning)**:
  - POS terminal bound to Tenant A cannot sync tickets to Tenant B endpoint.
- **Tier 4 (Chaos & Offline Reconnect Race)**:
  - Reconnect while cashier is actively ringing up an item; verify no UI freeze or duplicate ticket numbers.

### TICKET-005: Synthetic Seeders & Legal Shield (`packages/db`, `apps/web`)

- **Scope**: OpSec anti-attribution lock, synthetic fixtures, legal terms & cookie consent banner.
- **Tier 1 (Happy Path)**:
  - Seed database -> Verify all entities contain purely synthetic names (`Empresa Demo C.A.`, `Cliente de Prueba 01`).
  - Open web app -> Verify legal shield banner and cookie notice are displayed. Click acknowledge -> Banner dismisses and sets cookie.
- **Tier 2 (Boundary & OpSec Audit)**:
  - Grep test codebase and database seeders for real company names, real personal IDs, or private keys -> Zero matches allowed.
- **Tier 3 (Tenant Context Enforcement)**:
  - Seed dual-country tenants (VE Tenant `018e245a-0000-7000-8000-000000000001`, US Tenant `018e245a-0000-7000-8000-000000000002`). Verify each tenant has independent isolated chart of accounts.
- **Tier 4 (Chaos & Seed Reset)**:
  - Execute repeated database seeding; verify idempotency without duplicate key collisions or corrupted foreign keys.

### TICKET-006: Headless Integrations API (`apps/api`)

- **Scope**: External REST integrations (`/v1/integrations`) with API key, bearer auth, and `Idempotency-Key` interceptor.
- **Tier 1 (Happy Path)**:
  - Call `POST /v1/integrations/pos/sales` with valid API key and unique `Idempotency-Key` -> 201 Created with balanced journal entry ID.
- **Tier 2 (Boundary & Auth Resilience)**:
  - Call with missing `Idempotency-Key` -> 400 Bad Request.
  - Call with expired or invalid API key -> 401 Unauthorized.
  - Send oversized JSON payload (10MB) -> 413 Payload Too Large.
- **Tier 3 (Multi-Tenant API Isolation)**:
  - API key issued for Tenant A cannot read or write data for Tenant B.
- **Tier 4 (Idempotency Replay Stress Test)**:
  - Send 20 concurrent requests with identical `Idempotency-Key` and payload -> Exactly 1 request executes business logic; 19 return identical cached 201 response. Zero duplicate journal entries in database.

### TICKET-007: Multi-Tenant RBAC Engine (`packages/application`, `apps/api`)

- **Scope**: Multi-company membership and role-based permissions (`owner`, `admin`, `cashier`, `viewer`).
- **Tier 1 (Happy Path)**:
  - User with `owner` role can access all modules, execute journal entries, perform treasury swaps, and view audit logs.
- **Tier 2 (Boundary & Unauthorized Role Mutation)**:
  - User with `viewer` role attempts `POST /v1/accounting/journal-entries` -> 403 Forbidden.
  - User with `cashier` role attempts `POST /v1/accounting/treasury/swaps` -> 403 Forbidden.
- **Tier 3 (Cross-Tenant Role Divergence)**:
  - User is `owner` in Tenant A (VE) but `viewer` in Tenant B (US). Switch to Tenant B -> Write operations become forbidden.
- **Tier 4 (Privilege Escalation Chaos)**:
  - Tamper with JWT or request headers attempting to inject `roles: ['owner']` into a restricted session -> Token signature verification rejects request with 401 Unauthorized.

### TICKET-008: Multi-Company Tenant Switching API (`apps/api`, `apps/web`)

- **Scope**: User tenant discovery (`GET /v1/access/tenants`) and active tenant switching (`POST /v1/access/tenants/switch`).
- **Tier 1 (Happy Path)**:
  - Call `GET /v1/access/tenants` -> Returns list of memberships with company details.
  - Call `POST /v1/access/tenants/switch` with target tenant ID -> Returns new JWT session cookie with updated tenant context.
- **Tier 2 (Boundary & Malicious Switch Attempt)**:
  - Attempt to switch to a tenant ID where user has no active membership -> 403 Forbidden.
  - Attempt to switch to an invalid UUID -> 400 Bad Request.
- **Tier 3 (Zero Session Leakage After Switch)**:
  - User views invoices in Tenant A -> Switches to Tenant B -> Refresh `/invoicing` -> Previous invoices are gone; only Tenant B invoices appear.
- **Tier 4 (Concurrent Switch Requests)**:
  - Rapid parallel tenant switch requests; ensure session state does not deadlock or corrupt active tenant cookie.

### TICKET-009: Granular Account Determination (`@corebiz/invoicing`, `@corebiz/accounting`)

- **Scope**: Two-tier revenue account determination (Item override `line.revenueAccountId` vs Company default fallback `command.revenueAccountId`).
- **Tier 1 (Happy Path)**:
  - Invoice with Line 1 (Service item with account `4.1.02`) and Line 2 (Merchandise item without override, fallback to `4.1.01`).
  - Generated Journal Entry credits `4.1.02` for Line 1 amount and `4.1.01` for Line 2 amount.
  - Debit Receivable (`1.1.02`) == Sum of Credits ($\sum D \equiv \sum C$).
- **Tier 2 (Boundary & Non-Existent Account)**:
  - Invoice line references a non-existent account ID -> Reject with `AccountNotFoundException`.
  - Both line override and company fallback are missing -> Reject with `MissingRevenueAccountException`.
- **Tier 3 (Multi-Tenant Account Boundary)**:
  - Line references an account ID belonging to Tenant B -> Reject with cross-tenant account resolution error.
- **Tier 4 (Multi-Line Penny Split Chaos)**:
  - Invoice with 10 lines splitting revenue across 5 distinct accounts with odd percentages and VAT; verify debit equals sum of all credits to the exact penny.

### TICKET-010: Accounting & Invoicing Web Experience (`apps/web`)

- **Scope**: UI screens: `/accounting`, `/accounting/trial-balance`, `/accounting/journal-entries`, `/invoicing`.
- **Tier 1 (Happy Path)**:
  - Navigate to `/accounting` -> Chart of accounts table renders with categories (Assets, Liabilities, Equity, Revenue, Expenses).
  - Navigate to `/accounting/trial-balance` -> Balance table renders with debits and credits columns and zero discrepancy badge.
  - Navigate to `/invoicing` -> Commercial invoices table renders with status badges.
- **Tier 2 (Boundary & Empty States)**:
  - Navigate to empty ledger / brand new tenant -> Displays clean `<Empty>` state component without crash.
  - Open screens under restricted viewport (mobile 375px) -> Verify responsive tables and controls do not overflow viewport.
- **Tier 3 (Multi-Tenant Data Partitioning)**:
  - Verify navigation across all 4 screens shows strictly the active tenant's financial figures.
- **Tier 4 (Page Reload During Navigation)**:
  - Rapid navigation and browser refresh (F5) across accounting routes; assert zero unhandled promise rejections or hydration mismatches.

### TICKET-011: Statutory Fiscal Books & Tax Reports (`apps/web`, `@corebiz/fiscal`)

- **Scope**: SENIAT Libro de Ventas & Libro de Compras (Providencias SNAT/2026/00084 y 00093), US Sales Tax Remittance Summary.
- **Tier 1 (Happy Path)**:
  - Navigate to `/fiscal/sales-book` -> Renders statutory columns (Operación #, Fecha, RIF, Comprobante, Base Imponible, 16% IVA, 3% IGTF).
  - Navigate to `/fiscal/purchases-book` -> Renders supplier RIF, purchases subtotal, deductible VAT, retained VAT.
  - Navigate to `/fiscal/us-sales-tax` -> Renders state, county, and municipal tax splits.
- **Tier 2 (Boundary & Date Filter Testing)**:
  - Filter by date range with zero transactions -> Clean zeroed totals row without NaN.
  - Filter by reversed date range (from > to) -> Proper validation message without server crash.
- **Tier 3 (Jurisdiction Lockdown)**:
  - US tenant navigating to `/fiscal/sales-book` -> Shows informational alert that SENIAT reports apply only to Venezuelan jurisdiction.
- **Tier 4 (Tax Aggregation Chaos)**:
  - Verify sum of individual invoice lines in the table equals the statutory summary card totals at the bottom.

### TICKET-012: Bank Reconciliation Engine (`@corebiz/accounting`, `apps/web`)

- **Scope**: Bank statement import, automatic line matching, balanced adjustment vouchers.
- **Tier 1 (Happy Path)**:
  - Import bank statement CSV with 3 lines.
  - Match Line 1 to existing journal entry payment -> Status = `MATCHED`.
  - For Line 2 (unrecognized bank fee of $5.00), generate adjustment voucher -> Posts Debit Bank Fees (`6.1.02`) $5.00, Credit Bank Account (`1.1.01`) $5.00. Statement reconciles.
- **Tier 2 (Boundary & File Parsing Resilience)**:
  - Upload malformed CSV (missing columns, text in amount column) -> Reject with descriptive parsing error.
  - Upload duplicate statement with identical transaction IDs -> Prevent duplicate reconciliation.
- **Tier 3 (Multi-Tenant Bank Account Isolation)**:
  - Bank account from Tenant A cannot be reconciled or selected in Tenant B.
- **Tier 4 (Unbalanced Adjustment Exploit)**:
  - Attempt to submit bank adjustment with debit != credit -> Domain validation rejects before journal entry creation.

### TICKET-013: Multi-Currency Forex Revaluation (`@corebiz/accounting`, `apps/web`)

- **Scope**: IAS 21 / ASC 830 foreign currency exposure and unrealized exchange gain/loss journal entries.
- **Tier 1 (Happy Path)**:
  - Open exposure monitor at `/accounting/forex`.
  - Asset account holds $1,000 USD booked at historical rate 45.00 VES/USD (45,000 VES). Closing rate moves to 50.00 VES/USD (50,000 VES).
  - Execute revaluation -> Posts Debit Cash $1,000 (revaluation adjustment +5,000 VES) and Credit Unrealized Gain on Forex (`4.2.01`) 5,000 VES.
- **Tier 2 (Boundary & Rate Zero/Negative Checks)**:
  - Submit closing rate of 0.00 or negative -> Form validation rejects before execution.
  - Revaluate when closing rate equals booking rate -> 0 difference, no redundant journal entry generated.
- **Tier 3 (Tenant Currency Isolation)**:
  - Revaluation operates strictly on the active tenant's functional and foreign currency accounts.
- **Tier 4 (Currency Volatility Chaos)**:
  - Run revaluation back-to-back with fluctuating rates; verify cumulative unrealized gain/loss ledger balances correctly reflect net market movement.

### TICKET-014: Fiscal Printer Hardware Abstraction (`@corebiz/fiscal`, `apps/pos`)

- **Scope**: Physical printer protocol abstraction (`FiscalPrinterPort`, `HkaFiscalPrinterDriver`, `EscPosPrinterDriver`, `VirtualFiscalPrinterDriver`).
- **Tier 1 (Happy Path)**:
  - Issue POS sale -> Driver formats HKA byte protocol stream: `i01...`, `i02...`, `3...`.
  - Request Reporte X -> Generates read-only inspection accumulator summary.
  - Request Reporte Z -> Closes daily fiscal cycle, increments consecutive Z number, resets daily sales accumulator.
- **Tier 2 (Boundary & Hardware Failure Resilience)**:
  - Simulate printer out of paper / serial timeout -> Driver raises `PrinterHardwareException`, sale is queued in offline retry buffer.
  - Simulate fiscal memory full -> Driver signals warning and transitions to read-only state.
- **Tier 3 (Driver Context Isolation)**:
  - US tenant defaults to `EscPosPrinterDriver` (standard thermal receipt); VE tenant defaults to `HkaFiscalPrinterDriver` (SENIAT statutory firmware).
- **Tier 4 (Concurrency & Spooler Chaos)**:
  - Rapid print requests dispatched while previous print job is transmitting -> Thread/queue lock serializes jobs without command stream corruption.

### TICKET-015: Treasury Swaps & Crypto/Foreign Exchange Asset Acquisition (`@corebiz/accounting`, `apps/web`)

- **Scope**: Asset-to-Asset currency conversions (USD / USDT / VES) with P2P/network fee segregation.
- **Tier 1 (Happy Path)**:
  - Record Swap: Outgoing 5,000 VES from Cash (`1.1.01`), Incoming $100 USD to Digital Wallet (`1.1.02`), Fee 50 VES to Financial Fees (`6.1.02`).
  - Journal Entry balances: Debits (Wallet + Fees) == Credits (Cash).
- **Tier 2 (Boundary & Validation Resilience)**:
  - Swap where source account equals destination account -> Reject with `IdenticalSourceAndTargetException`.
  - Negative exchange rate or negative incoming amount -> Reject with validation error.
  - Empty P2P reference when required by audit policy -> Prompt user for reference note.
- **Tier 3 (Multi-Tenant Isolation)**:
  - Tenant A executes a swap. Tenant B visits `/accounting/treasury` -> Zero swaps visible.
- **Tier 4 (Rapid Double-Click Submission)**:
  - Click "Registrar Swap" button twice in rapid succession (100ms) -> Server Action and backend idempotency ensure only 1 swap and 1 journal entry are created.

### TICKET-016: Partner Drawings & Owner Traceability (`@corebiz/accounting`, `apps/web`)

- **Scope**: Partner cash drawings and merchandise consumption traceability without ledger corruption.
- **Tier 1 (Happy Path)**:
  - Cash Drawing: Partner draws $200 USD from Cash Drawer (`1.1.01`).
    - Ledger: Debit Partner Equity (`3.1.02`) $200, Credit Cash Drawer (`1.1.01`) $200.
  - Merchandise Consumption: Partner consumes 2 units of Item A at inventory cost $15.00 each ($30.00 total).
    - Ledger: Debit Partner Equity (`3.1.02`) $30, Credit Inventory Asset (`1.1.03`) $30. Stock decreases by 2.
- **Tier 2 (Boundary & Invariant Protection)**:
  - Attempt cash drawing of $0.00 or negative -> Reject with validation error.
  - Attempt stock consumption with quantity <= 0 -> Reject.
  - Attempt stock consumption exceeding available inventory -> Reject with `InsufficientInventoryException`.
- **Tier 3 (Multi-Tenant & Role Isolation)**:
  - Partner drawings audit log at `/accounting/drawings` shows only current company partners.
  - Cashier role cannot record partner drawings without management authorization.
- **Tier 4 (Race Condition & Double Withdrawal)**:
  - Concurrently request drawing and cash reconciliation; assert cash drawer balance cannot become arbitrarily negative without audit warning.

---

## 4. Master QA Matrix Coverage Status

| Ticket ID      | Context          | Tier 1 (Happy Path) | Tier 2 (Boundary) | Tier 3 (Isolation) | Tier 4 (Chaos/Idempotency) | Overall QA Verdict |
| :------------- | :--------------- | :-----------------: | :---------------: | :----------------: | :------------------------: | :----------------: |
| **TICKET-001** | `fiscal`         |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-002** | `accounting`     |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-003** | `invoicing`      |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-004** | `pos`            |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-005** | `platform`       |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-006** | `integrations`   |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-007** | `access`         |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-008** | `access`         |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-009** | `invoicing`      |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-010** | `accounting/web` |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-011** | `fiscal/reports` |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-012** | `accounting`     |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-013** | `accounting`     |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-014** | `fiscal/pos`     |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-015** | `accounting`     |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |
| **TICKET-016** | `accounting`     |        PASS         |       PASS        |        PASS        |            PASS            |    **VERIFIED**    |

---

## 5. Automated E2E Adversarial Test Suite Roster

To validate the scenarios defined above in automated continuous integration:

1. `e2e/specs/acceptance.spec.ts`: Universal screen rendering audit across all 32 static routes (including all new accounting, invoicing, and fiscal views), verifying 200 OK, H1 accessibility, zero console crashes, and CSP integrity.
2. `e2e/specs/accounting-adversarial.spec.ts`: Dedicated 4-Tier test suite executing Happy Path, Boundary checks, Multi-Tenant zero-leakage, and Idempotency/Chaos tests for Treasury Swaps, Partner Drawings, Bank Reconciliation, and Trial Balance double-entry equality.
3. `e2e/specs/fiscal-multicountry-adversarial.spec.ts`: Dedicated 4-Tier test suite executing multi-country fiscal switching, SENIAT statutory books verification, US Sales Tax split verification, headless integrations API idempotency replay stress testing, and RBAC role restrictions.
