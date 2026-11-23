# SDD Specification: TICKET-005 — Synthetic Seeders, Legal Shield & Cookie Banner

## 1. Context & Business Need

CoreBiz is evaluated by recruiters, tech leads, potential clients, and exploratory users. To completely shield the project from legal liability, disputes, or attribution risks, the platform must enforce strict OpSec:

1. **Zero Attribution & 100% Synthetic Data**: No real customer names, phone numbers, addresses, personal identifications, or company names may ever appear in seeds, fixtures, or tests.
2. **Dual-Country Demo Seeders**:
   - **Venezuela (`VE`)**: `Empresa Demo C.A.` (synthetic RIF `J-50123456-7`, VEN-NIF chart of accounts, dual-currency USD/VES catalog).
   - **United States (`US`)**: `Demo Store Inc.` (synthetic EIN `12-3456789`, US GAAP chart of accounts, single-currency USD catalog with Sales Tax).
3. **Legal Shield & Fictitious Data Disclaimer**:
   - Persistent disclaimer banner and modal in `apps/web` stating clearly that all data is fictitious and generated strictly for technical demonstration and educational purposes.
4. **Cookie Consent Banner**:
   - A non-intrusive cookie consent banner informing visitors about essential cookies (session and authentication tokens) with "Accept" and "Preferences", persisting choice in `localStorage`.

## 2. Ubiquitous Language & Core Concepts

- **Synthetic Seeder**: Automated dataset populating pure fictitious entities (customers, products, invoices, chart of accounts) with valid mathematical invariants and zero real-world attribution.
- **Legal Shield Banner**: UI element informing visitors of the demo/fictitious nature of the system, disclaiming commercial warranties or fiscal filing claims.
- **Cookie Consent**: Client-side component complying with transparency standards, recording user acknowledgment of essential functional cookies without third-party tracking.

## 3. Architecture & File Structure

```text
apps/web/
  src/
    ui/
      legal-disclaimer-banner.tsx  # Sticky demo warning banner with synthetic data notice
      cookie-consent-banner.tsx    # Essential cookie notification with persistence
      legal-terms-modal.tsx        # Modal presenting full Terms of Service & Privacy Shield
  messages/
    en.json                        # English legal, disclaimer, and cookie copy
    es.json                        # Spanish legal, disclaimer, and cookie copy
packages/db/
  prisma/
    seed-synthetic.ts              # Modular synthetic seeder for VE and US tenants
plans/tickets/
  TICKET-005-synthetic-seeders-legal-shield.md
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Synthetic Data Shield Presentation

- **Given** an unauthenticated visitor or demo session user visits the web dashboard
- **When** the page renders
- **Then** a visible legal shield banner informs that all business records, tax IDs, and transaction data are synthetic and generated exclusively for educational and software demonstration purposes.

### Scenario 2: Cookie Consent Interaction

- **Given** a first-time visitor opens the web application
- **When** no cookie consent choice is recorded in storage
- **Then** the cookie consent banner displays explaining essential functional cookie usage.
- **When** the user clicks "Aceptar" / "Understood"
- **Then** the consent state is persisted in `localStorage` (`corebiz_cookie_consent = 'accepted'`) and the banner dismisses smoothly without re-prompting on refresh.

### Scenario 3: Dual-Country Demo Tenant Seeding

- **Given** synthetic seeding execution
- **When** seeders run for both jurisdictions
- **Then** `Empresa Demo C.A.` is seeded with synthetic RIF and VEN-NIF accounts, and `Demo Store Inc.` is seeded with synthetic EIN and US GAAP accounts, with 100% generic items and customers.

## 5. Verification Checklist

- [x] Create `apps/web/src/ui/legal-disclaimer-banner.tsx`
- [x] Create `apps/web/src/ui/cookie-consent-banner.tsx`
- [x] Add i18n keys for legal disclaimer, terms, and cookies in `apps/web/messages/es.json` and `apps/web/messages/en.json`
- [x] Integrate legal banners into `apps/web/app/layout.tsx`
- [x] Add unit tests verifying cookie consent storage logic and legal shield rendering
- [x] Zero comments policy strictly respected across all files
- [x] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
