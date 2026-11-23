# ARCH-001: Feature Breakdown & Domain Modeling

## 1. Problem Breakdown & Context

Prior to this initiative, CoreBiz only generated non-fiscal delivery notes and prohibited fiscal vocabulary. With Venezuelan SENIAT Providencias SNAT/2026/00084 and SNAT/2026/00093 removing mandatory software homologation and permitting authorized digital invoicing providers, CoreBiz can issue legitimate fiscal invoices and manage automated accounting.

## 2. Bounded Contexts & Ubiquitous Language

### 2.1. Accounting (`packages/domain/src/accounting`)

- **Account**: Node in a hierarchical chart of accounts with code (e.g. `1.1.01.01`), name, category, and normal balance side.
- **Normal Balance**:
  - `DEBIT`: Assets (`Activos`), Cost of Goods Sold (`Costos`), Expenses (`Gastos`).
  - `CREDIT`: Liabilities (`Pasivos`), Equity (`Patrimonio`), Revenue (`Ingresos`).
- **JournalEntry (Asiento de Diario)**: Balanced transaction containing multiple lines.
- **JournalEntryLine**: Atomic debit or credit amount allocated to an account.
- **Double-Entry Invariant**: $\sum \text{DebitCents} \equiv \sum \text{CreditCents}$. Unbalanced entries are rejected by domain.
- **Accounting Period**: Fiscal period that can be locked to prevent historical mutations.

### 2.2. Fiscal Jurisdiction (`packages/domain/src/fiscal`)

- **FiscalJurisdictionPort**: Strategy interface abstracting tax calculation, tax ID validation, and statutory reporting.
- **Rif**: Venezuelan tax identifier (V, E, J, G, C) with modulo 11 validation.
- **Ein**: US Employer Identification Number (`XX-XXXXXXX`).
- **TaxRate**: Immutable percentage value object.

### 2.3. Invoicing (`packages/domain/src/invoicing`)

- **Invoice**: Document representing accounts receivable with lines, tax breakdown, and payment status.
- **Lifecycle State Machine**: `DRAFT -> ISSUED -> PARTIALLY_PAID -> PAID`, or `ISSUED -> VOID`.
- **Balance Invariant**: `RemainingBalance = TotalAmount - TotalPaidAmount`. Payments cannot exceed remaining balance.
