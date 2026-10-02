import { can, type Actor, type Role } from '@corebiz/domain';
import type { ErpActorContext, ErpBridgePort, ErpScreenCapability } from '@corebiz/synapse';
import { ASSISTANT_SCREENS } from '../../use-cases/ai/system-prompt.js';

/**
 * Adapter that connects CoreBiz ERP with Synapse Assistant.
 */
export class CoreBizBridgeAdapter implements ErpBridgePort {
  readonly erpName = 'CoreBiz';

  getSystemInstructions(_actor: ErpActorContext): string {
    return 'CoreBiz es un ERP para comercios (clientes, productos, existencias, notas de entrega, compras y reportes en USD/VES). El impuesto es meramente informativo.';
  }

  getAvailableCapabilities(actor: ErpActorContext): Promise<readonly ErpScreenCapability[]> {
    const domainActor: Actor = {
      userId: actor.userId,
      role: actor.roleName as Role,
    };

    const capabilities: readonly ErpScreenCapability[] = ASSISTANT_SCREENS.filter(
      (screen) => screen.needs === undefined || can(domainActor, screen.needs),
    ).map((screen) => ({
      path: screen.path,
      name: screen.name,
      description: screen.what,
      ...(screen.needs !== undefined ? { requiredPermission: screen.needs } : {}),
    }));

    return Promise.resolve(capabilities);
  }
}
