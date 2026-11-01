import { Body, Controller, HttpCode, Inject, NotFoundException, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { previewInvitation, type InvitationPreview } from '@corebiz/infrastructure';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { IDENTITY } from '../../../tokens';
import type { VerifiedIdentity } from '../../../auth/authenticated-request';
import { databaseUrl } from '../../../config/driver';

const tokenSchema = z.object({ token: z.string().trim().min(1, 'Required').max(200) }).strict();

@ApiTags('alta')
@ApiBearerAuth()
@Controller('v1')
export class PreviewInvitationController {
  constructor(@Inject(IDENTITY) private readonly identity: VerifiedIdentity) {}

  @Post('invitations/preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Previsualizar una invitacion sin aceptarla' })
  async run(
    @Body(new ZodValidationPipe(tokenSchema)) body: z.infer<typeof tokenSchema>,
  ): Promise<InvitationPreview> {
    const preview = await previewInvitation(databaseUrl(), this.identity.userId, body.token);
    if (preview === null) {
      throw new NotFoundException({ errorKind: 'InvitationNotFound', errorParams: {} });
    }
    return preview;
  }
}
