import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { aiDraftSchema, askAssistantSchema, saveAiSettingsSchema } from '@corebiz/contracts';
import type { AiModel, AiSettingsView, AssistantStatus } from '@corebiz/application';
import { AssistantThrottleGuard } from '../../auth/assistant-throttle.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../http/api-error';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { USE_CASES } from '../../tokens';
import type { UseCases } from '../../composition/use-cases.provider';

/**
 * The company's AI connection. Owner and admin only.
 *
 * Nothing here returns the key or its ciphertext: the view carries the last four characters
 * and nothing else. `POST /models` is a read in spirit, but it carries a key in the body, and
 * a key in a query string ends up in access logs.
 */
@ApiTags('asistente')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/ai')
export class AiSettingsController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Get('settings')
  @RequirePermission('ai:configure')
  @ApiOperation({ summary: 'Proveedor de IA configurado, sin la clave' })
  async settings(): Promise<{ settings: AiSettingsView | null }> {
    return { settings: unwrapOrThrow(await this.useCases.getAiSettings()) };
  }

  @Post('models')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ai:configure')
  @ApiOperation({ summary: 'Modelos que puede usar esa clave, preguntados al proveedor' })
  async models(
    @Body(new ZodValidationPipe(aiDraftSchema)) body: z.infer<typeof aiDraftSchema>,
  ): Promise<{ models: readonly AiModel[] }> {
    return { models: unwrapOrThrow(await this.useCases.listAiModels(body)) };
  }

  @Post('settings')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ai:configure')
  @ApiOperation({ summary: 'Guardar el proveedor de IA, comprobado antes contra el proveedor' })
  async save(
    @Body(new ZodValidationPipe(saveAiSettingsSchema)) body: z.infer<typeof saveAiSettingsSchema>,
  ): Promise<{ settings: AiSettingsView }> {
    return { settings: unwrapOrThrow(await this.useCases.saveAiSettings(body)) };
  }

  @Delete('settings')
  @RequirePermission('ai:configure')
  @ApiOperation({ summary: 'Desconectar el asistente de su proveedor' })
  async remove(): Promise<{ removed: boolean }> {
    return unwrapOrThrow(await this.useCases.removeAiSettings());
  }
}

/** Asking the assistant. Every role. */
@ApiTags('asistente')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/assistant')
export class AssistantController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Get('status')
  @RequirePermission('assistant:use')
  @ApiOperation({ summary: 'Si hay IA configurada y si quien pregunta puede configurarla' })
  async status(): Promise<AssistantStatus> {
    return unwrapOrThrow(await this.useCases.assistantStatus());
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AssistantThrottleGuard)
  @RequirePermission('assistant:use')
  @ApiOperation({ summary: 'Preguntar al asistente. No guarda la conversacion' })
  async chat(
    @Body(new ZodValidationPipe(askAssistantSchema)) body: z.infer<typeof askAssistantSchema>,
  ): Promise<{ reply: string }> {
    return unwrapOrThrow(await this.useCases.askAssistant(body.messages));
  }
}
