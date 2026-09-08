import { Global, Module } from '@nestjs/common';
import {
  ACTIVE_CONTEXT,
  IDENTITY,
  MEMBERSHIPS,
  RUNTIME,
  SESSION_INFO,
  TENANT_CONTEXT,
  USE_CASES,
} from '../tokens';
import {
  activeContextProvider,
  identityProvider,
  membershipsProvider,
  sessionInfoProvider,
  tenantContextProvider,
} from './context.provider';
import { runtimeProvider } from './runtime.provider';
import { useCasesProvider } from './use-cases.provider';

/**
 * Composition root: el unico lugar del sistema donde se decide QUE implementacion
 * concreta cumple cada puerto.
 *
 * Es `@Global()` para que los modulos de negocio pidan sus dependencias sin tener que
 * importarlo. Eso es deliberado: un controller recibe el runtime, no lo construye. Si
 * un modulo pudiera alcanzar este archivo podria fabricarse un `TenantContext` a mano,
 * y ahi se acaba el aislamiento por tenant.
 */
@Global()
@Module({
  providers: [
    identityProvider,
    membershipsProvider,
    activeContextProvider,
    tenantContextProvider,
    sessionInfoProvider,
    runtimeProvider,
    useCasesProvider,
  ],
  exports: [
    IDENTITY,
    MEMBERSHIPS,
    ACTIVE_CONTEXT,
    TENANT_CONTEXT,
    SESSION_INFO,
    RUNTIME,
    USE_CASES,
  ],
})
export class CompositionModule {}
