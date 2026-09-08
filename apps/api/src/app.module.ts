import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

/**
 * Raiz de la aplicacion.
 *
 * Los modulos de negocio se apoyan en `packages/application` y `packages/domain`
 * exactamente igual que lo hacia el composition root de Next: esta API es un
 * ADAPTADOR PRIMARIO mas, no una capa nueva. Ningun controller decide una regla
 * de negocio; para eso estan los casos de uso.
 */
@Module({
  imports: [HealthModule],
})
export class AppModule {}
