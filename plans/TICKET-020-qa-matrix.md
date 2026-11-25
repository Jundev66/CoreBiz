# Senior QA Master Plan & Adversarial Matrix: TICKET-020

**Feature**: Statutory Fiscal Withholdings Engine (SENIAT IVA/ISLR & US 1099)  
**Scope**: `@corebiz/fiscal`, `@corebiz/contracts`, `apps/api`

---

## 1. Business Model Context & Ubiquitous Language

In statutory jurisdictions, designated corporate entities act as **Withholding Agents (Agentes de Retención)**:

- **Special Taxpayers (SENIAT Contribuyentes Especiales)**: Mandated to withhold 75% (standard) or 100% (non-compliant vendor) of the IVA charged on purchase invoices, and statutory ISLR percentages (e.g. 2% on technical/professional services).
- **Withholding Voucher (`WithholdingVoucher`)**: Official fiscal certificate issued to the vendor with a statutory 14-digit consecutive number formatted as `YYYYMM` + 8-digit sequence (e.g. `20261100000001`).
- **Fiscal Period (`fiscalPeriod`)**: Calendar tax period (`YYYY-MM` or quincenas `YYYY-MM-Q1` / `YYYY-MM-Q2`).
- **US Backup Withholding (IRS Form 1099)**: Mandatory 24% withholding on payments to vendors lacking valid TIN / W-9.
- **Double-Entry Invariant**: Total invoice amount equals net payable to vendor plus tax withheld. Accounts payable is debited and withholdings payable (`2.1.03`) is credited by the withheld amount.

---

## 2. What Was Built & Architectural Rationale

1. **Contracts Layer (`@corebiz/contracts`)**:
   - `withholdingTypeSchema` (`IVA_75`, `IVA_100`, `ISLR`, `US_1099_BACKUP`).
   - `withholdingStatusSchema` (`ISSUED`, `DECLARED`, `VOID`).
   - `issueWithholdingVoucherSchema`, `voidWithholdingVoucherSchema`, `listWithholdingVouchersQuerySchema`, `withholdingVoucherResponseSchema`.
2. **Fiscal Domain (`@corebiz/fiscal/domain`)**:
   - `WithholdingVoucher` Aggregate: Enforces exact basis point calculations (`computeWithheldAmount`), currency matching between taxable base and tax, non-negative amounts, and immutable state machine (`ISSUED` -> `DECLARED` / `VOID`).
   - `WithholdingVoucherRepository` port.
3. **Fiscal Application (`@corebiz/fiscal/application`)**:
   - `IssueWithholdingVoucherCommandHandler`: Generates consecutive statutory number per period, calculates withholding without penny drift, and persists voucher.
   - `VoidWithholdingVoucherCommandHandler`: Voids voucher requiring an explicit audit reason.
   - `ListWithholdingVouchersQueryHandler`: Filters vouchers by tenant, fiscal period, and vendor tax ID.
4. **API Controllers & Module Wiring (`apps/api`)**:
   - `POST /v1/fiscal/withholdings`: Emits withholding voucher.
   - `POST /v1/fiscal/withholdings/:id/void`: Voids withholding voucher.
   - `GET /v1/fiscal/withholdings`: Lists withholding vouchers with period and vendor filters.
   - Controllers registered in `FiscalModule`.

---

## 3. 4-Tier Adversarial Test Matrix

### Tier 1: Nominal Withholding Issuance & Numbering

- Purchase invoice with base $100.00 (`10000` minor) and 16% IVA $16.00 (`1600` minor).
- Issue `IVA_75` voucher for period `2026-11` -> Assert withheld amount is exactly $12.00 (`1200` minor).
- Assert voucher number is assigned as `20261100000001`.
- Issue second voucher in same period -> Assert voucher number is `20261100000002`.
- Issue `IVA_100` voucher on $40.00 tax -> Assert withheld amount is $40.00.
- Issue `ISLR` 2% voucher on $500.00 base -> Assert withheld amount is $10.00.
- Issue `US_1099_BACKUP` 24% voucher on $1,000.00 base -> Assert withheld amount is $240.00.

### Tier 2: State Transitions & Formal Voiding

- Declare active voucher -> Status transitions to `DECLARED` with recorded `declaredAt` timestamp.
- Void active voucher with reason -> Status transitions to `VOID` with recorded `voidReason` and `voidedAt`.
- Attempt to void without reason -> Rejection with `VoidReasonRequired`.
- Attempt to void an already voided voucher -> Rejection with `VoucherAlreadyFinalized`.

### Tier 3: Mathematical Precision & Currency Integrity

- Zero Penny Drift: Validate that integer math (`(baseUnits * percentageBp) / 10000n`) maintains zero fractional cent loss across large batches.
- Currency Mismatch: Reject creation when taxable base is in `VES` and tax amount is in `USD`.
- Negative Amount: Reject vouchers with negative monetary values.

### Tier 4: Multi-Tenant & Period Segregation

- Register vouchers across different fiscal periods (`2026-10` vs `2026-11`).
- Query by period `2026-11` -> Assert strictly November vouchers returned.
- Register vouchers for Tenant Alpha and Tenant Beta.
- Assert Tenant Alpha query returns only Alpha vouchers and cannot observe Beta vouchers or manipulate Beta sequences.
