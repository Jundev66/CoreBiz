# SDD Specification: TICKET-001 — Fiscal Bounded Context (`@corebiz/fiscal`)

## 1. Context & Business Need

CoreBiz requires decoupling country-specific fiscal rules into a standalone bounded context (`@corebiz/fiscal`). This package must be independent of business application layers, providing fiscal validation, tax calculation, and jurisdiction-specific rules via `FiscalJurisdictionPort`.

## 2. Ubiquitous Language & Entities

- **FiscalCountry**: Supported jurisdiction codes (`'VE' | 'US'`).
- **TaxRate**: Value Object representing percentage in basis points (e.g. 1600 = 16.00%), exempt status, and tax classification.
- **Rif**: Value Object representing Venezuelan tax identifier (`J-12345678-9`, `V-`, `E-`, `G-`, `P-`) with digit verification algorithm.
- **Ein**: Value Object representing US Employer Identification Number (`12-3456789`) with syntax validation.
- **FiscalJurisdictionPort**: Strategy interface implemented by jurisdiction engines:
  - `calculateTaxes(input: TaxCalculationInput): TaxCalculationResult`
  - `validateTaxId(taxId: string): Result<void, FiscalValidationError>`
  - `getJurisdictionRules(): FiscalRules`
- **VenezuelaFiscalEngine**: Implementation of SENIAT rules (Providencias SNAT/2026/00084 y 00093), IVA (16%, 8%, 0%), IGTF (3% on foreign currency payments), and withholding rules.
- **UnitedStatesFiscalEngine**: Implementation of US Sales Tax rules (state/county/city composite rate calculation, EIN validation, exempt certificates).

## 3. Package Structure (Single Package with Subpath Exports)

```text
packages/fiscal/
  package.json              # exports: ., ./domain, ./infrastructure
  tsconfig.json             # extends ../../tsconfig.base.json
  src/
    index.ts                # re-exports domain & infrastructure
    domain/
      index.ts
      value-objects/
        rif.ts
        ein.ts
        tax-rate.ts
      port/
        fiscal-jurisdiction-port.ts
    infrastructure/
      index.ts
      venezuela-fiscal-engine.ts
      united-states-fiscal-engine.ts
  tests/
    rif.test.ts
    ein.test.ts
    tax-rate.test.ts
    venezuela-fiscal-engine.test.ts
    united-states-fiscal-engine.test.ts
    mothers/
      RifMother.ts
      EinMother.ts
      TaxRateMother.ts
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Venezuelan Tax & IGTF Calculation

- **Given** a Venezuelan tenant and a sale of $100.00 USD paid in foreign currency cash (cash USD)
- **When** `VenezuelaFiscalEngine.calculateTaxes` is invoked
- **Then** subtotal is $100.00, IVA (16%) is $16.00, IGTF (3%) is $3.48 (3% of $116.00), and total is $119.48.

### Scenario 2: Venezuelan RIF Validation

- **Given** a valid synthetic Venezuelan RIF `J-12345678-9`
- **When** `Rif.create` is invoked
- **Then** it returns an `Ok(Rif)` with sanitized uppercase format.
- **Given** an invalid checksum or malformed string `J-12345678-0`
- **When** `Rif.create` is invoked
- **Then** it returns an `Err(InvalidRifChecksum)`.

### Scenario 3: US Sales Tax Calculation

- **Given** a US tenant with 8.25% composite Sales Tax (State 6.25% + County 1.00% + City 1.00%)
- **When** `UnitedStatesFiscalEngine.calculateTaxes` is invoked for a taxable item of $100.00
- **Then** tax amount is exactly $8.25 and total is $108.25 without IGTF.

### Scenario 4: Boundary & Architecture Integrity

- **Given** `packages/fiscal/src/domain`
- **Then** it imports only from `@corebiz/shared-kernel` and NEVER from infrastructure or frameworks.
- **Given** `.dependency-cruiser.cjs`
- **Then** running `pnpm arch` reports 0 violations.

## 5. Verification Checklist

- [x] `packages/fiscal` scaffolded via `pnpm new:context fiscal`
- [x] `Rif`, `Ein`, `TaxRate`, and `FiscalJurisdictionPort` moved to `packages/fiscal/src/domain/`
- [x] `VenezuelaFiscalEngine` and `UnitedStatesFiscalEngine` moved to `packages/fiscal/src/infrastructure/`
- [x] Subpath exports `./domain` and `./infrastructure` configured in `packages/fiscal/package.json`
- [x] Test suite with Object Mothers in `packages/fiscal/tests/`
- [x] Zero comments in all source and test files
- [x] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
