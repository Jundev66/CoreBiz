# SDD Specification: TICKET-017 — Operational Expenses, Logistics & Disbursements Engine

## 1. Context & Business Need

In commercial businesses and dual-currency environments (e.g. Venezuela and the US), enterprises incur continuous operational expenditures beyond direct inventory purchases:

1. **Logistics & Freight**: Inland freight, international cargo forwarding, courier, courier delivery, transport fuel.
2. **Utilities & Rent**: Commercial store/warehouse rent, electricity, internet/telecom, municipal rates.
3. **Supplies & Minor Tools**: Packing materials, stationery, cleaning products, office consumables.
4. **Maintenance & Repairs**: Facility upkeep, refrigeration repair, electrical maintenance.
5. **Customs Duties & Port Taxes**: Tariffs, import nationalization permits, customs broker fees.
6. **Professional & Administrative Services**: Accounting, legal advice, IT infrastructure.

Without a structured operational disbursement module, business owners and store managers frequently withdraw funds from drawers or transfer from company bank accounts without real-time booking, causing unexplained cash shortages, reconciliation mismatches, and distorted income statements.

In double-entry financial accounting:

- **Disbursement posting**: Every operational expense debits an operating expense account (`6.1.xx` or `60xx`) and credits a liquid asset account (`1.1.xx` or `10xx` Cash/Bank/Wallet).
- **Double-Entry Invariant**: $\sum \text{Debits} \equiv \sum \text{Credits}$ to the exact cent.
- **Traceability**: Capturing vendor/beneficiary name, tax identifier (optional), receipt/invoice number, expense category, payment source, memo, and link to the generated journal entry.

---

## 2. Ubiquitous Language & Core Concepts

- **Disbursement / OperationalExpense**: An aggregate representing an authorized monetary outflow for company operational costs.
- **DisbursementCategory**: Enum categorizing operational costs:
  - `LOGISTICS`: Freight, transportation, shipping, fuel, delivery.
  - `UTILITIES_RENT`: Store/warehouse rent, electricity, water, internet, telecom.
  - `SUPPLIES`: Packaging, stationery, office consumables, cleaning products.
  - `MAINTENANCE`: Facility maintenance, machinery repairs, equipment servicing.
  - `CUSTOMS_DUTIES`: Port charges, customs clearance, import tariffs, nationalization taxes.
  - `SERVICES`: Legal, accounting, software licenses, security services.
  - `GENERAL`: Miscellaneous operating disbursements.
- **DisbursementNumber**: Sequential human-readable reference (e.g. `EGR-000001`).
- **DisbursementRepository**: Secondary port for saving and querying disbursements.

---

## 3. Architecture & File Structure

```text
packages/accounting/
  src/
    domain/
      model/
        disbursement.ts                   # Disbursement aggregate
      port/
        disbursement-repository.ts       # Repository port
      templates/
        default-chart-of-accounts.ts     # Expanded expense templates
    application/
      commands/
        record-disbursement.command.ts   # Command handler posting double-entry
      queries/
        list-disbursements.query.ts      # Query handler listing disbursements
    infrastructure/
      persistence/
        in-memory-disbursement-repository.ts
packages/contracts/
  src/
    disbursements.ts                     # Zod schemas & DTOs
apps/api/
  src/
    modules/
      accounting/
        controllers/
          record-disbursement.controller.ts
          list-disbursements.controller.ts
apps/web/
  src/
    actions/
      disbursements.ts                   # Server Actions
    api/
      disbursements.ts                   # HTTP client
  app/(app)/
    accounting/
      expenses/
        page.tsx                         # Operational expenses & logistics view
```

---

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Recording Freight Logistics Payment in USD Cash

- **Given** an active tenant with $500.00 in Cash Drawer (`1.1.01`) and standard expense accounts
- **When** the manager registers a disbursement of $45.00 USD for "Flete marítimo de mercancía" to "Transportes Rápidos C.A." under category `LOGISTICS`
- **Then** a `Disbursement` aggregate is persisted with sequential number `EGR-000001`
- **And** a balanced double-entry Journal Entry is created:
  - Debit: Logistics & Freight (`6.1.03` / `6020`) $45.00
  - Credit: Cash Drawer (`1.1.01` / `1010`) $45.00
  - Total Debits strictly equal Total Credits ($\sum D \equiv \sum C$).

### Scenario 2: Recording Store Rent via Bank Transfer in VES

- **Given** an active tenant operating in Venezuela with bank funds
- **When** the administrator records a disbursement of 5,000.00 VES under category `UTILITIES_RENT` for "Alquiler de local comercial"
- **Then** a balanced Journal Entry is posted:
  - Debit: Utilities & Rent (`6.1.04`) 5,000.00 VES
  - Credit: Bank Account (`1.1.01`) 5,000.00 VES
- **And** the disbursement appears in the audit log with receipt reference and date.

### Scenario 3: Rejecting Non-Positive Amount

- **Given** a disbursement command with amount $0.00 or negative amount
- **When** validating the command
- **Then** domain validation rejects the transaction with `InvalidDisbursementAmountException` before database writes.

---

## 5. Verification Checklist

- [x] Expand Chart of Accounts templates in `@corebiz/accounting` with granular expense accounts
- [x] Implement `Disbursement` aggregate and repository port in `@corebiz/accounting`
- [x] Implement `RecordDisbursementCommandHandler` ensuring atomic balanced journal entry creation
- [x] Implement `ListDisbursementsQueryHandler`
- [x] Define Zod contracts in `@corebiz/contracts`
- [x] Expose REST controllers in `apps/api`
- [x] Implement web dashboard at `/accounting/expenses` in `apps/web`
- [x] Register permissions and navigation in `shell.tsx` and `module-access.ts`
- [x] Zero comments policy strictly enforced
- [x] Unit tests, typecheck, lint, arch, and Playwright verification passing 100%
