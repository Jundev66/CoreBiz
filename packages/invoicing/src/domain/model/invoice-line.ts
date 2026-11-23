import { Money, type Quantity, QUANTITY_SCALE, ok, err, type Result } from '@corebiz/shared-kernel';
import { type TaxRate } from '@corebiz/fiscal/domain';

export interface InvoiceLineError {
  readonly kind: 'NegativeUnitPrice' | 'NonPositiveQuantity' | 'EmptyDescription';
}

export class InvoiceLine {
  readonly id: string;
  readonly productId?: string | undefined;
  readonly description: string;
  readonly quantity: Quantity;
  readonly unitPrice: Money;
  readonly taxRate: TaxRate;
  readonly subtotal: Money;
  readonly taxAmount: Money;
  readonly total: Money;

  private constructor(
    id: string,
    productId: string | undefined,
    description: string,
    quantity: Quantity,
    unitPrice: Money,
    taxRate: TaxRate,
    subtotal: Money,
    taxAmount: Money,
    total: Money,
  ) {
    this.id = id;
    this.productId = productId;
    this.description = description;
    this.quantity = quantity;
    this.unitPrice = unitPrice;
    this.taxRate = taxRate;
    this.subtotal = subtotal;
    this.taxAmount = taxAmount;
    this.total = total;
  }

  static create(
    id: string,
    description: string,
    quantity: Quantity,
    unitPrice: Money,
    taxRate: TaxRate,
    productId?: string,
  ): Result<InvoiceLine, InvoiceLineError> {
    if (description.trim() === '') {
      return err({ kind: 'EmptyDescription' });
    }

    if (unitPrice.isNegative) {
      return err({ kind: 'NegativeUnitPrice' });
    }

    if (quantity.scaledValue <= 0n) {
      return err({ kind: 'NonPositiveQuantity' });
    }

    const subtotal = unitPrice.multiplyScaled(quantity.scaledValue, QUANTITY_SCALE);
    const taxMinor = taxRate.calculateTaxAmount(subtotal.minorUnits);
    const taxAmount = Money.fromMinor(taxMinor, subtotal.currency);
    const total = Money.fromMinor(subtotal.minorUnits + taxAmount.minorUnits, subtotal.currency);

    return ok(
      new InvoiceLine(
        id,
        productId,
        description.trim(),
        quantity,
        unitPrice,
        taxRate,
        subtotal,
        taxAmount,
        total,
      ),
    );
  }
}
