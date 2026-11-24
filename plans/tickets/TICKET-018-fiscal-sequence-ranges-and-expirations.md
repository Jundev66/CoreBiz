# SDD Specification: TICKET-018 — Fiscal Sequence Ranges & Expiration Control Engine

**Status**: `TRIAGED (Future Scope / Backlog)`  
**Scope**: `@corebiz/fiscal`, `@corebiz/invoicing`, `apps/api`, `apps/web`

---

## 1. Context & Business Need

In statutory tax jurisdictions (e.g. Colombia DIAN, Dominican Republic DGII, and Venezuela pre-printed Formas Libres), invoice numbering is governed by an explicit government or printing house authorization document:

1. **Resolution / Authorization Document**: Dictates a legal authorization number, date of issuance, and authorized prefix.
2. **Authorized Number Range**: Defines a strict lower bound (`fromNumber`) and upper bound (`toNumber`).
3. **Expiration Date (`expiresAt`)**: In jurisdictions like Colombia (DIAN) and Dominican Republic (DGII), resolutions carry an expiration date (typically 12 to 24 months). If this date passes without renewal, the taxpayer is legally prohibited from issuing invoices.
4. **Finite Batch Control**: In Venezuela, pre-printed Formas Libres come in batches with finite Control Numbers (`00-XXXXXXXX`) authorized under a specific SENIAT printing house notification.

Conversely, in flexible accounting jurisdictions like the **United States (IRS / GAAP)**, no state or federal agency issues invoice numbering ranges or expiration dates. Businesses generate internal invoice numbers (`INV-XXXX`) at will.

### Problem Statement:

- Businesses operating in statutory jurisdictions risk legal penalties, invalidated invoices, and tax fines if they accidentally issue invoices with expired resolutions or depleted sequence ranges.
- Configuration screens must be strictly country-aware: a company operating in Miami (US) should never be exposed to "Resolution Expiration" settings, whereas companies in Caracas (VE) or Bogotá (CO) require explicit sequence management.

---

## 2. Ubiquitous Language & Core Concepts

- **FiscalSequenceRange**: An aggregate representing an authorized block of sequential invoice or control numbers granted under a specific fiscal resolution.
- **ResolutionNumber**: Legal identifier of the administrative act or printing house authorization.
- **Prefix**: Optional alphanumeric prefix preceding the sequential digits (e.g. `SETP`, `00-`, `FAC`).
- **RangeBounds**: Invariant requiring $fromNumber \le currentNumber \le toNumber$.
- **SequenceStatus**:
  - `ACTIVE`: Valid date range and unexhausted sequence.
  - `EXHAUSTED`: `currentNumber` has reached `toNumber`.
  - `EXPIRED`: `now() > expiresAt`.
  - `INACTIVE`: Manually revoked or suspended by the company accountant.
- **WarningThreshold**: Configurable alert margin (e.g. less than 100 remaining numbers or less than 15 days before expiration) triggering backoffice notifications.

---

## 3. Domain Model & Invariants

```typescript
export interface FiscalSequenceRangeProps {
  readonly id: string;
  readonly tenantId: string;
  readonly jurisdiction: string;
  readonly documentType: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  readonly prefix: string;
  readonly fromNumber: bigint;
  readonly toNumber: bigint;
  readonly currentNumber: bigint;
  readonly resolutionNumber?: string | undefined;
  readonly resolutionDate?: Date | undefined;
  readonly expiresAt?: Date | undefined;
  readonly warningThreshold?: number | undefined;
  readonly status: 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'INACTIVE';
}
```

### Invariants:

1. **Vigencia Temporal**: If $expiresAt \neq null$ and $now() > expiresAt$, the sequence status automatically becomes `EXPIRED`. Any call to `nextDocumentNumber()` fails with `FiscalSequenceExpiredException`.
2. **Límite de Rango**: If $currentNumber > toNumber$, the sequence status becomes `EXHAUSTED`. Calling `nextDocumentNumber()` fails with `FiscalSequenceExhaustedException`.
3. **Monotonicidad Consecutiva**: $currentNumber$ increments strictly by $1n$ per issued document. No gaps or reused numbers are allowed.

---

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Rejecting Invoice Issuance When Fiscal Resolution Has Expired

- **Given** an active tenant in a statutory jurisdiction with a resolution expired on `2026-10-31`
- **When** an operator attempts to issue an invoice on `2026-11-24`
- **Then** the application rejects the command with `FiscalSequenceExpiredException` before creating database rows
- **And** no balanced accounting journal entry or invoice is persisted.

### Scenario 2: Rejecting Invoice Issuance When Number Range Is Exhausted

- **Given** an authorized range from `1` to `1000` with `currentNumber = 1000`
- **When** the cashier processes the 1001st sale
- **Then** the domain rejects the issuance with `FiscalSequenceExhaustedException`
- **And** advises the administrator to register a new authorized resolution.

### Scenario 3: Multi-Country UI Adaptation in Settings

- **Given** a user authenticated in a United States company (`jurisdiction === 'US'`)
- **When** navigating to Company Settings
- **Then** the "Fiscal Sequences & Expirations" section is completely hidden
- **Given** a user in Venezuela (`'VE'`) or future countries (`'CO'`)
- **When** navigating to Settings
- **Then** the sequence management panel is visible and allows configuring Control Number ranges.

---

## 5. Verification Checklist (For Future Implementation)

- [ ] Implement `FiscalSequenceRange` aggregate and repository in `@corebiz/invoicing`
- [ ] Connect `IssueInvoiceCommandHandler` to check sequence status before finalizing documents
- [ ] Implement country filter guard in UI (`canManageFiscalSequences(tenant.jurisdiction)`)
- [ ] Add warning notification banners when resolution is within 15 days of expiration or 100 numbers remaining
- [ ] Unit tests with Object Mothers verifying expiration and exhaustion boundary conditions
- [ ] Playwright E2E testing for statutory sequence workflow
