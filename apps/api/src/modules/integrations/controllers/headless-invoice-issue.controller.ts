import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiHeader } from '@nestjs/swagger';
import type { z } from 'zod';
import { issueInvoiceSchema } from '@corebiz/contracts';
import { IssueInvoiceCommandHandler } from '@corebiz/application';
import { Money } from '@corebiz/domain';
import { IntegrationsApiKeyGuard } from '../../../auth/integrations-api-key.guard';
import { IntegrationsThrottleGuard } from '../../../auth/integrations-throttle.guard';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { INTEGRATIONS_RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('integraciones')
@ApiBearerAuth()
@UseGuards(IntegrationsApiKeyGuard, IntegrationsThrottleGuard)
@Controller('v1/integrations')
export class HeadlessInvoiceIssueController {
  constructor(@Inject(INTEGRATIONS_RUNTIME) private readonly runtime: Runtime) {}

  @Post('invoices')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Emision de factura headless para sistemas externos y POS' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Clave de idempotencia' })
  async run(
    @Headers('idempotency-key') idempotencyKeyHeader: string | undefined,
    @Body(new ZodValidationPipe(issueInvoiceSchema))
    body: z.infer<typeof issueInvoiceSchema>,
  ) {
    const lines = body.lines.map((l) => {
      const unitPriceParsed = Money.of(l.unitPrice, body.currency);
      return {
        id: crypto.randomUUID(),
        description: l.description,
        quantity: l.quantity,
        unitPriceMinor: unitPriceParsed.ok ? unitPriceParsed.value.minorUnits : 0n,
        taxPercentage: l.taxPercentage,
        productId: l.productId,
      };
    });

    const handler = new IssueInvoiceCommandHandler(
      this.runtime.invoices,
      this.runtime.journalEntries,
    );

    const result = await handler.execute({
      id: crypto.randomUUID(),
      tenantId: '00000000-0000-0000-0000-000000000000',
      customerId: body.customerId,
      documentType: body.documentType,
      documentNumber: body.documentNumber,
      controlNumber: body.controlNumber,
      issueDate: body.issueDate,
      dueDate: body.dueDate,
      currency: body.currency,
      receivableAccountId: body.receivableAccountId,
      revenueAccountId: body.revenueAccountId,
      taxPayableAccountId: body.taxPayableAccountId,
      lines,
    });

    const val = unwrapOrThrow(result);
    return {
      ok: true,
      invoiceId: val.invoiceId,
      journalEntryId: val.journalEntryId,
    };
  }
}
