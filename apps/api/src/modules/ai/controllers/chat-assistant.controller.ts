import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { askAssistantSchema } from '@corebiz/contracts';
import { AssistantThrottleGuard } from '../../../auth/assistant-throttle.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('asistente')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/assistant')
export class ChatAssistantController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AssistantThrottleGuard)
  @RequirePermission('assistant:use')
  @ApiOperation({ summary: 'Preguntar al asistente. No guarda la conversacion' })
  async run(
    @Body(new ZodValidationPipe(askAssistantSchema)) body: z.infer<typeof askAssistantSchema>,
  ): Promise<{ reply: string; actions?: readonly { label: string; href: string }[] }> {
    return unwrapOrThrow(await this.useCases.askAssistant(body.messages, body.errorContext));
  }
}
