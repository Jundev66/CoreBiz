# SDD Specification: TICKET-011 — Statutory Fiscal Books & Tax Reports Engine (VE SENIAT & US Sales Tax)

## 1. Context & Business Need

Enterprises operating in distinct tax jurisdictions have statutory obligations to generate formal fiscal reports for audit, tax filing, and compliance:

1. **Venezuela (`VE`)**: SENIAT mandates the generation of the **Libro Especial de Ventas** and **Libro Especial de Compras** (Providencias SNAT/2026/00084 y 00093). The book requires strict chronological sequencing, customer/supplier RIF, official invoice number, fiscal control number, credit/debit note references, total billed amount, non-taxable/exempt base, taxable base partitioned by rate (General 16%, Reducida 8%, Adicional), calculated tax debit/credit, IGTF (3%), and VAT withholdings (Comprobantes de Retención de IVA 75% / 100%).
2. **United States (`US`)**: Requires multi-state and multi-jurisdiction **Sales Tax Remittance Reports** summarizing gross receipts, non-taxable exemptions (certificates of exemption / reseller certificates), taxable sales base, and tax collected broken down by State, County, and City tax jurisdictions for Form 1099/Sales Tax return filings.

The engine must decouple tax reporting logic through the strategy pattern (`FiscalReportingPort`) and maintain zero hardcoded tax rules in the presentation or database layers.

## 2. Ubiquitous Language & Core Concepts

- **SalesBookEntry (Libro de Ventas)**: Immutable statutory record of an issued invoice or credit note, detailing fiscal control numbers, VAT quotas (16%, 8%), IGTF, and applied VAT withholdings.
- **PurchasesBookEntry (Libro de Compras)**: Statutory record of supplier goods receipts and vendor bills, recording tax credits and withholding obligations.
- **SalesTaxJurisdictionBreakdown**: US report slicing taxable revenue and tax collections across federal, state, and local taxing authorities.
- **FiscalPeriod**: Date range defining a tax compliance cycle (bi-weekly / monthly / quarterly).

## 3. Architecture & File Structure

```text
packages/fiscal/
  src/
    domain/
      port/
        fiscal-reporting.port.ts         # Generic port for fiscal reporting
      model/
        fiscal-period.ts                 # Tax period value object
        sales-book-record.ts             # VE statutory sales book record
        purchases-book-record.ts         # VE statutory purchases book record
        us-sales-tax-record.ts           # US statutory sales tax remittance record
    infrastructure/
      reports/
        venezuela-fiscal-book.service.ts # SENIAT SNAT/2026/00084 & 00093 generator
        united-states-tax-report.service.ts
packages/contracts/
  src/
    fiscal-reports.ts                    # DTOs & query schemas
apps/api/
  src/
    modules/
      fiscal/
        controllers/
          get-sales-book.controller.ts
          get-purchases-book.controller.ts
          get-us-tax-summary.controller.ts
apps/web/
  src/
    api/
      fiscal-reports.ts                  # Client query wrapper
  app/(app)/
    fiscal/
      sales-book/
        page.tsx                         # Libro de Ventas SENIAT viewer
      purchases-book/
        page.tsx                         # Libro de Compras SENIAT viewer
      us-sales-tax/
        page.tsx                         # US Sales Tax Remittance viewer
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Venezuelan Libro Especial de Ventas Generation

- **Given** an active tenant with `fiscalCountry = 'VE'` and issued invoices in the current tax period
- **When** requesting `GET /v1/fiscal/reports/sales-book?startDate=2026-11-01&endDate=2026-11-30`
- **Then** the returned report contains:
  - Sequence number (`operacion_nro`)
  - Customer RIF in valid format (`J-12345678-9`, `V-12345678-9`)
  - Official invoice number and SENIAT control number
  - Total sales, exempt base, taxable base 16%, VAT debit (16%), and IGTF (3%)
  - Clean column totals matching arithmetic invariants.

### Scenario 2: US Sales Tax Remittance Summary

- **Given** an active tenant with `fiscalCountry = 'US'` and sales across multiple tax jurisdictions
- **When** requesting `GET /v1/fiscal/reports/us-tax-summary?startDate=2026-11-01&endDate=2026-11-30`
- **Then** the report groups gross sales, exempt sales, and collected sales tax categorized by tax jurisdiction code.

## 5. Verification Checklist

- [x] Implement `FiscalReportingPort` in `@corebiz/fiscal/domain`
- [x] Implement `VenezuelaFiscalBookService` conforming to SENIAT providencias
- [x] Implement `UnitedStatesTaxReportService`
- [x] Expose REST controllers in `apps/api` with `@RequirePermission('accounting:read')`
- [x] Implement CSV export / print views in `apps/web`
- [x] Zero comments policy strictly respected
- [x] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
