# SDD Specification: TICKET-014 — Fiscal Printer & Electronic Billing Hardware Abstraction

## 1. Context & Business Need

Physical retail and counter operations (POS) require direct communication with certified physical printing hardware and cloud fiscal authorization services:

1. **Venezuela (`VE`)**: SENIAT regulations require certified Fiscal Printers (e.g., The Factory HKA / Bixolon / Epson Fiscal / BMC) containing a tamper-proof Fiscal Memory and Audit Roll. The software must transmit structured byte-level commands to generate fiscal invoices, non-fiscal delivery notes, Reporte X (partial shift audit), and Reporte Z (statutory daily closing).
2. **United States (`US`)**: Requires standard ESC/POS or Star Micronics receipt printers printing customizable customer sales receipts with detailed State/County/City sales tax breakdowns.
3. **Headless / Digital Invoicing**: Cloud-based environments require integration with authorized digital printing houses (Imprentas Digitales / PACs) returning cryptographic fiscal validation stamps (CUFE / Sello Digital).

To protect hexagonal boundaries and prevent hardware lock-in, CoreBiz introduces the `FiscalPrinterPort` abstraction in `@corebiz/pos` and `@corebiz/fiscal`.

## 2. Ubiquitous Language & Core Concepts

- **FiscalPrinterPort**: Hardware and cloud abstraction port defining printing primitives (`printFiscalInvoice`, `printNonFiscalDocument`, `printDailyCloseReportZ`, `printAuditReportX`).
- **ReporteZ (Daily Fiscal Close)**: Statutory closing document that clears temporary accumulator registers and records irreversible daily totals into fiscal memory.
- **ReporteX (Shift Subtotal)**: Mid-shift audit report printing current register totals without closing or resetting accumulators.
- **HkaProtocolDriver**: Serial / TCP byte driver translating high-level CoreBiz invoice models into HKA fiscal protocol frames.
- **EscPosReceiptDriver**: Standard ESC/POS driver for US receipt printers.

## 3. Architecture & File Structure

```text
packages/fiscal/
  src/
    domain/
      port/
        fiscal-printer.port.ts           # Hardware interface contract
      model/
        fiscal-report-z.ts               # Reporte Z value object
        fiscal-report-x.ts               # Reporte X value object
        printer-status.ts                # Paper, memory, and error states
    infrastructure/
      hardware/
        hka-fiscal-printer.driver.ts     # The Factory HKA serial/TCP adapter
        esc-pos-printer.driver.ts        # US receipt printer adapter
        virtual-fiscal-printer.driver.ts # Synthetic simulator for unit/E2E testing
apps/pos/
  src/
    services/
      hardware-printer.service.ts        # WebUSB / WebSerial / Local network printer bridge
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Venezuelan Fiscal Invoice Execution via HKA Protocol

- **Given** a finalized POS sale in Venezuela with 16% standard VAT
- **When** the cashier triggers receipt printing
- **Then** the driver sends protocol commands:
  - Header with Company Legal Name, RIF, and Address
  - Line items with prices and tax flags (`G` for General 16%)
  - Subtotal and total calculation
  - The printer responds with official invoice number and control number.

### Scenario 2: Statutory Daily Close (Reporte Z)

- **Given** an open cashier shift at the end of the business day
- **When** the cashier executes daily close
- **Then** the printer prints Reporte Z, clears daily accumulators, and records the closing summary in CoreBiz database.

### Scenario 3: Hardware Offline Resilience

- **Given** a disconnected or out-of-paper fiscal printer
- **When** a sale completes
- **Then** the print job is held in the local offline queue without freezing cashier operations or dropping the sale.

## 5. Verification Checklist

- [ ] Define `FiscalPrinterPort` in `@corebiz/fiscal/domain`
- [ ] Implement `VirtualFiscalPrinterDriver` for headless and automated testing
- [ ] Implement `HkaFiscalPrinterDriver` for Venezuelan fiscal printers
- [ ] Implement `EscPosPrinterDriver` for US and general receipt printers
- [ ] Connect POS hardware printing bridge in `apps/pos`
- [ ] Zero comments policy strictly respected
- [ ] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
