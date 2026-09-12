import { Scope, type FactoryProvider } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import {
  makeAdjustStock,
  makeChangeMemberRole,
  makeCreateCustomer,
  makeUpdateCustomer,
  makeCreateProduct,
  makeUpdateProduct,
  makeCreateSupplier,
  makeUpdateSupplier,
  makeInviteUser,
  makeRecordAuditExport,
  makeIssueDeliveryNote,
  makeMarkDelivered,
  makeReceiveGoods,
  makeVoidGoodsReceipt,
  makeRemoveMember,
  makeRevokeInvitation,
  makeSetCustomerStatus,
  makeSetProductStatus,
  makeSetSupplierStatus,
  makeUpdateTenantSettings,
  makeVoidDeliveryNote,
  systemClock,
  type TenantContext,
} from '@corebiz/application';
import { cryptoTokenFactory } from '@corebiz/infrastructure';
import { RUNTIME, TENANT_CONTEXT, USE_CASES } from '../tokens';
import type { Runtime } from './runtime.provider';

/**
 * Los casos de uso, ya inyectados.
 *
 * Es el bloque de retorno de `forRequest()` tal cual estaba. No se refactoriza en esta
 * migracion a proposito: cuando cambian a la vez el framework y la forma de montar las
 * dependencias, un fallo no dice cual de las dos cosas lo causo.
 *
 * Devolver funciones ya inyectadas —en lugar de un contenedor consultable— hace que
 * la llamada quede tipada y que no exista forma de pedir algo que no se ha montado.
 */
function assembleUseCases(runtime: Runtime, ctx: TenantContext) {
  const shared = {
    uow: runtime.uow,
    ctx,
    clock: systemClock,
    ids: { next: () => uuidv7() },
  };

  // Los tokens de invitacion se generan con `randomBytes`, no con Math.random: un
  // token predecible es una puerta abierta a la empresa que lo espera.
  const withTokens = { ...shared, tokens: cryptoTokenFactory() };

  return {
    createCustomer: makeCreateCustomer(shared),
    updateCustomer: makeUpdateCustomer(shared),
    setCustomerStatus: makeSetCustomerStatus(shared),
    createProduct: makeCreateProduct(shared),
    updateProduct: makeUpdateProduct(shared),
    adjustStock: makeAdjustStock(shared),
    setProductStatus: makeSetProductStatus(shared),
    issueDeliveryNote: makeIssueDeliveryNote(shared),
    // Almacen puede confirmar la entrega aunque no pueda emitir ni anular: es el unico
    // punto donde ese rol actua sobre un documento de venta, y es deliberado. Quien
    // mueve las cajas es quien sabe que llegaron.
    markDelivered: makeMarkDelivered(shared),
    voidDeliveryNote: makeVoidDeliveryNote(shared),

    // Administracion.
    inviteUser: makeInviteUser(withTokens),
    changeMemberRole: makeChangeMemberRole(shared),
    removeMember: makeRemoveMember(shared),
    revokeInvitation: makeRevokeInvitation(shared),
    updateTenantSettings: makeUpdateTenantSettings(shared),
    recordAuditExport: makeRecordAuditExport(shared),

    // Compras. El gate del modulo vive en el caso de uso, no en la ruta ni en el guard:
    // una Server Action se puede invocar directamente.
    createSupplier: makeCreateSupplier(shared),
    updateSupplier: makeUpdateSupplier(shared),
    setSupplierStatus: makeSetSupplierStatus(shared),
    receiveGoods: makeReceiveGoods(shared),
    voidGoodsReceipt: makeVoidGoodsReceipt(shared),
  } as const;
}

export const useCasesProvider: FactoryProvider = {
  provide: USE_CASES,
  scope: Scope.REQUEST,
  inject: [RUNTIME, TENANT_CONTEXT],
  useFactory: assembleUseCases,
};

/**
 * El tipo se saca de la funcion y NO del provider.
 *
 * `FactoryProvider.useFactory` esta declarado como `(...args: any[]) => any`, asi que
 * `ReturnType<typeof provider.useFactory>` es `any` — y con el, cada `this.useCases.x()`
 * de los seis controllers dejaba de comprobarse. Compilaba en verde y no verificaba
 * nada: exactamente el tipo de agujero que el resto del proyecto evita.
 */
export type UseCases = ReturnType<typeof assembleUseCases>;
