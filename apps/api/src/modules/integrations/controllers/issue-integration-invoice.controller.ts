import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiHeader } from '@nestjs/swagger';
import type { z } from 'zod';
import { integrationInvoiceSchema } from '@corebiz/contracts';
import { IssueInvoiceCommandHandler } from '@corebiz/application';
import { Money } from '@corebiz/domain';
import { IntegrationsApiKeyGuard } from '../../../auth/integrations-api-key.guard';
import { IntegrationsThrottleGuard } from '../../../auth/integrations-throttle.guard';
import { IdempotencyInterceptor } from '../../../auth/idempotency.interceptor';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { INTEGRATIONS_RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

const DEFAULT_INTEGRATION_TENANT_ID = '00000000-0000-4000-8000-000000000001';

@ApiTags('integraciones')
@ApiBearerAuth()
@UseGuards(IntegrationsApiKeyGuard, IntegrationsThrottleGuard)
@UseInterceptors(IdempotencyInterceptor)
@Controller('v1/integrations')
export class IssueIntegrationInvoiceController {
  constructor(@Inject(INTEGRATIONS_RUNTIME) private readonly runtime: Runtime) {}

  @Post('invoices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Emision de factura headless para sistemas externos con generacion automatica de asiento',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Clave de idempotencia obligatoria',
  })
  @ApiHeader({ name: 'x-tenant-id', required: false, description: 'ID del tenant objetivo' })
  async run(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body(new ZodValidationPipe(integrationInvoiceSchema))
    body: z.infer<typeof integrationInvoiceSchema>,
  ) {
    const tenantId = tenantIdHeader?.trim() || DEFAULT_INTEGRATION_TENANT_ID;

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
      tenantId,
      customerId: body.customerId,
      documentType: body.documentType,
      documentNumber: body.documentNumber,
      controlNumber: body.controlNumber,
      issueDate: body.issueDate,
      dueDate: body.dueDate,
      currency: body.currency,
      receivableAccountId: body.receivableAccountId ?? 'acc-receivable-default',
      revenueAccountId: body.revenueAccountId ?? 'acc-revenue-default',
      taxPayableAccountId: body.taxPayableAccountId ?? 'acc-tax-default',
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
