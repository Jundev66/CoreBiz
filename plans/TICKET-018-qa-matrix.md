# Senior QA Master Plan & Adversarial Matrix: TICKET-018

**Feature**: Fiscal Sequence Ranges & Expiration Control Engine  
**Scope**: `@corebiz/fiscal`, `@corebiz/invoicing`, `@corebiz/contracts`, `apps/api`

---

## 1. Business Model Context & Ubiquitous Language

In regulated statutory tax jurisdictions (e.g. Venezuela Formas Libres, Colombia DIAN, Dominican Republic DGII), enterprises are prohibited from issuing invoices with arbitrary sequential numbers:

- **Fiscal Sequence Range (`FiscalSequenceRange`)**: Government or printing-house approved numerical block with lower bound (`fromNumber`), upper bound (`toNumber`), and optional legal resolution number.
- **Expiration Control (`expiresAt`)**: Date boundary past which the sequence becomes invalid (`EXPIRED`).
- **Exhaustion Boundary (`toNumber`)**: Numerical ceiling past which no more invoices can be issued under that resolution (`EXHAUSTED`).
- **Multi-Country Behavior**: In the United States (US), businesses operate under open numbering rules; the fiscal guard silently bypasses sequence range locks.

---

## 2. What Was Built & Architectural Rationale

1. **Contracts Layer (`@corebiz/contracts`)**:
   - `fiscalDocumentTypeSchema` (`INVOICE`, `CREDIT_NOTE`, `DEBIT_NOTE`, `CONTROL_NUMBER`).
   - `fiscalSequenceStatusSchema` (`ACTIVE`, `EXHAUSTED`, `EXPIRED`, `INACTIVE`).
   - `createFiscalSequenceRangeSchema` & `fiscalSequenceRangeResponseSchema`.
2. **Fiscal Domain (`@corebiz/fiscal/domain`)**:
   - `FiscalSequenceRange` Aggregate Root: Enforces monotonicity, bounds validation, and temporal/numerical state transitions (`ACTIVE` -> `EXHAUSTED` / `EXPIRED`).
   - `FiscalSequenceRangeRepository` port.
3. **Fiscal Application (`@corebiz/fiscal/application`)**:
   - `FiscalSequenceGuard`: Country-aware service asserting that statutory jurisdictions possess valid, unexpired sequences prior to billing.
   - `CreateFiscalSequenceRangeCommandHandler`: Registers authorized ranges.
   - `ListFiscalSequenceRangesQueryHandler`: Queries active ranges with real-time remaining units and warning flags.
4. **API Controllers (`apps/api`)**:
   - `POST /v1/fiscal/sequences`: Creates a sequence range.
   - `GET /v1/fiscal/sequences`: Lists sequence ranges with expiration and exhaustion health checks.

---

## 3. 4-Tier Adversarial Test Matrix

### Tier 1: Nominal Lifecycle & Monotonic Numbering

- Create active range 1 to 500 with prefix `00-`.
- Advance sequence -> Assert assigned number is 1, formatted as `00-00000001`, remaining numbers = 499.
- Advance sequence again -> Assert assigned number is 2, formatted as `00-00000002`.

### Tier 2: Jurisdiction Segregation

- Assert US jurisdiction (`'US'`) bypasses sequence check cleanly without requiring a registered sequence range.
- Assert statutory jurisdiction (`'VE'`) rejects document creation with `NoActiveFiscalSequenceRange` when no range is registered.

### Tier 3: Temporal Expiration & Range Exhaustion

- Register sequence expiring on `2026-10-31`.
- Advance sequence on `2026-11-24` -> Assert rejection with `FiscalSequenceExpired`.
- Register sequence from 1 to 2 with current number 1.
- Advance sequence to 2 -> Status transitions to `EXHAUSTED`.
- Attempt 3rd advancement -> Assert rejection with `FiscalSequenceExhausted`.

### Tier 4: Threshold Warning & Proactive Alerts

- Set threshold of 10 remaining numbers and 15 days expiration.
- Verify `isNearExhaustion` returns true when 5 units remain.
- Verify `isNearExpiration` returns true when 10 days remain before `expiresAt`.
