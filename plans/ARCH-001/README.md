# ARCH-001: Multi-Country Fiscal & Double-Entry Accounting Engine

**Spec ID**: `ARCH-001`  
**Status**: IN IMPLEMENTATION  
**Lead Architect**: Antigravity Senior Architecture Team  
**Review Trigger**: SDD (Spec-Driven Development)

---

## Structure of this Specification Folder

| Document                                                                                             | Purpose                                                                                                |
| :--------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| [feature-breakdown.md](file:///D:/Dev/CoreBiz/plans/ARCH-001/feature-breakdown.md)                   | Business context, ubiquitous language, user stories, domain invariants, and mathematical rules.        |
| [file-references-and-routes.md](file:///D:/Dev/CoreBiz/plans/ARCH-001/file-references-and-routes.md) | Exact directory structure, affected files, contracts, Prisma models, and headless REST endpoints.      |
| [qa-matrix.md](file:///D:/Dev/CoreBiz/plans/ARCH-001/qa-matrix.md)                                   | 4-Tier adversarial test matrix: double-entry integrity, multi-tenant RLS attack, and idempotency spam. |

---

## Executive Summary

CoreBiz expands from an internal delivery-note application to a full-fledged international financial engine:

1. **Agnostic Accounting Core**: Double-entry bookkeeping ($\sum \text{Debits} \equiv \sum \text{Credits}$) with chart of accounts, general ledger, and trial balance.
2. **Fiscal Strategy Pattern (`FiscalJurisdictionPort`)**:
   - Primary: **Venezuela (`VE`)** compliant with SENIAT Providencias SNAT/2026/00084 (no software homologation) and SNAT/2026/00093 (authorized digital invoicing/imprentas digitales, optional fiscal printers).
   - Secondary validation: **United States (`US`)** with state/county/city Sales Tax and EIN.
3. **Multi-Company Context**: User membership across multiple isolated tenants with per-tenant currency and fiscal jurisdiction.
4. **Headless Integration API**: Clean REST entrypoints allowing external sales systems to delegate invoice issuance and accounting generation.
