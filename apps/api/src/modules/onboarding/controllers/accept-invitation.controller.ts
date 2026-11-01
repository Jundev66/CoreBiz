import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { acceptInvitation } from '@corebiz/infrastructure';
import { domainError } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { IDENTITY } from '../../../tokens';
import type { VerifiedIdentity } from '../../../auth/authenticated-request';
import { databaseUrl } from '../../../config/driver';

const tokenSchema = z.object({ token: z.string().trim().min(1, 'Required').max(200) }).strict();

@ApiTags('alta')
@ApiBearerAuth()
@Controller('v1')
export class AcceptInvitationController {
  constructor(@Inject(IDENTITY) private readonly identity: VerifiedIdentity) {}

  @Post('invitations/accept')
  @ApiOperation({ summary: 'Aceptar una invitacion y entrar en la empresa' })
  async run(
    @Body(new ZodValidationPipe(tokenSchema)) body: z.infer<typeof tokenSchema>,
  ): Promise<{ tenantId: string }> {
    const result = await acceptInvitation(databaseUrl(), this.identity.userId, body.token);
    if (!result.ok) throw domainError(result.error);
    return { tenantId: result.tenantId };
  }
}
