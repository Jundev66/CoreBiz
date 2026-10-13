import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';

/**
 * El runtime lo recibe del composition root, que es `@Global`: aqui solo vive el
 * controller. Construirlo en este modulo obligaria a importar `composition/`, y eso esta
 * prohibido por `api-modules-no-composition` precisamente para que un modulo no pueda
 * fabricarse un `TenantContext`.
 */
@Module({ controllers: [IntegrationsController] })
export class IntegrationsModule {}
