# SDD Specification: TICKET-015 — Treasury Swaps & Crypto/Foreign Exchange Asset Acquisition

## 1. Context & Business Need

In hyper-inflationary and dual-currency economies (such as Venezuela operating in VES and USD/USDT), businesses routinely convert cash holdings from local currency (`VES`) into hard currency or digital stablecoins (`USDT` on TRON/Polygon, physical USD cash, or foreign bank wire transfers) to hedge purchasing power and pay foreign suppliers for imported goods.

A common pitfall in SMB bookkeeping is misclassifying these conversions as expenses (`EXPENSE`), which artificially inflates costs and obscures company cash positions.

In double-entry financial accounting:

1. **Asset-to-Asset Swap**: Exchanging VES for USD/USDT is an exchange between two Asset accounts (`ASSET` to `ASSET`).
2. **Transaction Fees / P2P Spreads**: Any network gas fee, P2P commission, or exchange variance must be explicitly isolated as a financial expense (`6.1.xx Financial Fees`).
3. **Double-Entry Invariant**: $\sum \text{Debits} \equiv \text{USDT Asset} + \text{Fees} \equiv \sum \text{Credits} \equiv \text{VES Cash}$.
4. **Full Traceability**: Recording the source account, destination wallet/bank, agreed exchange rate, counterparty reference (P2P order # or blockchain hash), and authorized operator.

## 2. Ubiquitous Language & Core Concepts

- **TreasurySwap**: Financial exchange transaction transferring value from a source asset account to a destination asset account across different currencies.
- **CryptoAssetHolding**: General ledger sub-account tracking digital stablecoins (e.g. `1.1.04 USDT`).
- **ExchangeFee**: Network, bank, or platform commission incurred during the swap.
- **CounterpartyReference**: External transaction proof (P2P order ID, wire reference, or TX hash).

## 3. Architecture & File Structure

```text
packages/accounting/
  src/
    domain/
      model/
        treasury-swap.ts                 # Treasury swap aggregate
        crypto-holding.ts                # Crypto asset value object
      port/
        treasury-repository.ts
    application/
      commands/
        execute-treasury-swap.command.ts # Execute swap & post balanced journal entry
      queries/
        list-treasury-swaps.query.ts
packages/contracts/
  src/
    treasury.ts                          # DTOs and validation schemas
apps/api/
  src/
    modules/
      accounting/
        controllers/
          execute-treasury-swap.controller.ts
          list-treasury-swaps.controller.ts
apps/web/
  app/(app)/
    accounting/
      treasury-swaps/
        page.tsx                         # Treasury & crypto swap history
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Purchasing USDT with VES Bank Funds

- **Given** an active tenant with 100,000.00 VES in Bank (`1.1.01`) and an agreed rate of 50.00 VES per USDT
- **When** executing a treasury swap for 2,000.00 USDT with a $5.00 USDT network fee
- **Then** a balanced journal entry is posted:
  - Debit: USDT Digital Asset (`1.1.04`) for 1,995.00 USDT (equivalent in VES)
  - Debit: Financial Fees (`6.1.05`) for 5.00 USDT (equivalent in VES)
  - Credit: VES Bank (`1.1.01`) for 100,000.00 VES
  - Total Debits strictly equal Total Credits ($\sum D \equiv \sum C$).
  - Traceability captures operator user ID, P2P order #, and target wallet.

## 5. Verification Checklist

- [x] Implement `TreasurySwap` domain aggregate in `@corebiz/accounting`
- [x] Enforce double-entry balance across cross-currency asset swaps
- [x] Record blockchain TX hash / P2P order reference
- [x] Expose REST controllers in `apps/api`
- [x] Implement web dashboard in `apps/web`
- [x] Zero comments policy strictly respected
- [x] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
