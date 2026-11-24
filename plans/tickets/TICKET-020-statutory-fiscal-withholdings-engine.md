# SDD Specification: TICKET-020 — Statutory Fiscal Withholdings Engine (SENIAT IVA/ISLR & US 1099)

**Status**: `PROPOSED (Ready for Implementation)`  
**Scope**: `packages/fiscal`, `packages/accounting`, `packages/contracts`, `apps/api`, `apps/web`

---

## 1. Context & Business Need

In statutory tax jurisdictions, government tax administrations mandate that designated corporate entities act as **Withholding Agents (Agentes de Retención)**:

1. **Venezuela (SENIAT — Contribuyentes Especiales)**:
   - **Retención de IVA**: Obligatory withholding of 75% (standard) or 100% (when provider tax information is unverified/non-compliant) of the charged IVA on purchase invoices.
   - **Comprobante de Retención de IVA**: Official statutory certificate that must be issued within the first days of the following calendar period, indicating voucher number, period, invoice affected, tax base, and withheld amount.
   - **Retención de ISLR**: Withholding on professional services, freight, civil contracts, or rent according to statutory tariff percentages (e.g. 1%, 2%, 3%, 5%).
   - **Accounting Posting**:
     - At purchase time: Debits Expense/Inventory, Debits Surtax (IVA Crédito Fiscal), Credits Withholdings Payable (`2.1.03` Retenciones de IVA por Enterar), Credits Cash/Accounts Payable (`2.1.01`).
     - At tax clearance time (Entero al SENIAT): Debits Withholdings Payable (`2.1.03`), Credits Bank/Cash (`1.1.01`).

2. **United States (IRS — 1099 Vendor Reporting)**:
   - **Form 1099-NEC / 1099-MISC**: Requirement to report cumulative annual payments exceeding $600 to non-corporate independent contractors, vendors, and service providers.
   - **Backup Withholding**: Mandatory withholding (24%) if vendor fails to furnish valid TIN / W-9.

---

## 2. Ubiquitous Language & Core Concepts

- **FiscalWithholdingVoucher**: An aggregate representing a statutory withholding voucher issued by the company to a vendor (or received from a customer).
  - `voucherNumber`: Formatted sequential identifier (e.g. `20261100000001` format YYYYMM + sequence).
  - `fiscalPeriod`: Tax period (e.g. `2026-11` or quincena `2026-11-Q1` / `2026-11-Q2`).
  - `withholdingType`: `IVA` | `ISLR` | `BACKUP_WITHHOLDING`.
  - `percentageBp`: Basis points (e.g. 7500 for 75%, 10000 for 100%, 200 for 2%).
  - `withheldAmount`: Computed withheld monetary value.
  - `status`: `ISSUED` | `DECLARED` | `VOID`.
- **WithholdingJurisdictionPort**: Port delegating statutory formatting and rate determination per country.

---

## 3. Architecture & File Structure

```text
packages/fiscal/
  src/
    domain/
      model/
        withholding-voucher.ts           # Withholding voucher aggregate
      port/
        withholding-voucher-repository.ts
packages/accounting/
  src/
    application/
      commands/
        issue-withholding-voucher.command.ts
      queries/
        list-withholding-vouchers.query.ts
        get-withholdings-summary.query.ts
packages/contracts/
  src/
    withholdings.ts                      # Zod schemas & DTOs
apps/api/
  src/
    modules/
      fiscal/
        controllers/
          issue-withholding-voucher.controller.ts
          list-withholding-vouchers.controller.ts
apps/web/
  src/
    app/(app)/
      fiscal/
        withholdings/
          page.tsx                       # Withholding vouchers and SENIAT report
```

---

## 4. Domain Models & Invariants

1. **Balance Consistency**: On any vendor purchase with withholding applied:
   $$\text{Total Invoice Amount} \equiv \text{Net Payable to Vendor} + \text{Total Tax Withheld}$$
2. **Double-Entry Invariant**: The creation of a withholding voucher creates a balanced journal entry:
   - Debit: Accounts Payable (`2.1.01`) by withheld amount.
   - Credit: Tax Withholdings Payable (`2.1.03`) by withheld amount.
     $$\sum \text{Debits} \equiv \sum \text{Credits}$$
3. **Sequential Integrity**: Voucher numbers must be strictly sequential per tax period.

---

## 5. Acceptance Criteria (Given / When / Then)

### Scenario 1: Issue SENIAT 75% IVA Withholding Voucher on Purchase

- **Given**: A purchase invoice from a supplier for $100.00 subtotal + $16.00 IVA (Total: $116.00).
- **And**: The active company is a designated SENIAT Special Taxpayer in Venezuela.
- **When**: The accountant applies a 75% IVA withholding.
- **Then**: Withheld amount is calculated as $12.00 (75% of $16.00).
- **And**: Net payable to the supplier is reduced to $104.00.
- **And**: Voucher `20261100000001` is generated with status `ISSUED`.
- **And**: Journal entry is posted debiting Accounts Payable $12.00 and crediting Account `2.1.03` for $12.00.

---

## 6. Quality Gates & Test Plan

1. **Precision Test**: Assert exact cent withholding calculation across 1,000 synthetic transactions without penny drift.
2. **Statutory Book Verification**: Assert that the SENIAT Libro de Compras correctly populates the "IVA Retenido por el Comprador" column with the exact voucher number.
3. **E2E Playwright**: Test navigation to `/fiscal/withholdings`, voucher generation, and voucher PDF preview.
