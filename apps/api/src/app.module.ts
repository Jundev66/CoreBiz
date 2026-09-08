import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuthMiddleware } from './auth/auth.middleware';
import { CompositionModule } from './composition/composition.module';
import { HealthModule } from './health/health.module';
import { AdministrationModule } from './modules/administration/administration.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DeliveryNotesModule } from './modules/delivery-notes/delivery-notes.module';
import { InsightsModule } from './modules/insights/insights.module';
import { ProductsModule } from './modules/products/products.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { SessionModule } from './modules/session/session.module';

/**
 * Raiz de la aplicacion.
 *
 * Los modulos de negocio se apoyan en `packages/application` y `packages/domain`
 * exactamente igual que lo hacia el composition root de Next: esta API es un
 * ADAPTADOR PRIMARIO mas, no una capa nueva. Ningun controller decide una regla de
 * negocio; para eso estan los casos de uso.
 */
@Module({
  imports: [
    AuthModule,
    CompositionModule,
    HealthModule,
    SessionModule,
    CustomersModule,
    ProductsModule,
    DeliveryNotesModule,
    PurchasingModule,
    AdministrationModule,
    InsightsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    /*
     * La autenticacion se aplica a todo MENOS a lo que no puede tenerla:
     *
     *  - `health` lo consultan Render y un monitor externo, y ninguno tiene sesion.
     *  - `docs` es la documentacion, que ademas no se publica en produccion.
     *
     * La lista es de exclusiones y no de inclusiones a proposito: con una lista de
     * rutas protegidas, anadir un endpoint y olvidarse de apuntarlo lo deja abierto.
     * Asi, olvidarse deja el endpoint protegido, que es el fallo correcto.
     */
    consumer
      .apply(AuthMiddleware)
      .exclude('health', 'health/(.*)', 'docs', 'docs/(.*)', 'docs-json')
      .forRoutes('*');
  }
}
