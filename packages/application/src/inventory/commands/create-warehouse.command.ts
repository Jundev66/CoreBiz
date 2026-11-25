import { ok, err, type Result } from '@corebiz/shared-kernel';
import { Warehouse, type WarehouseError, type WarehouseRepository } from '@corebiz/domain';

export interface CreateWarehouseCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly isDefault?: boolean | undefined;
  readonly address?: string | undefined;
}

export type CreateWarehouseError =
  WarehouseError | { readonly kind: 'WarehouseCodeAlreadyExists'; readonly code: string };

export class CreateWarehouseCommandHandler {
  constructor(private readonly warehouseRepo: WarehouseRepository) {}

  async execute(
    command: CreateWarehouseCommand,
  ): Promise<Result<{ warehouseId: string }, CreateWarehouseError>> {
    const existing = await this.warehouseRepo.findByCode(command.tenantId, command.code);
    if (existing) {
      return err({ kind: 'WarehouseCodeAlreadyExists', code: command.code });
    }

    if (command.isDefault) {
      const currentDefault = await this.warehouseRepo.findDefault(command.tenantId);
      if (currentDefault) {
        await this.warehouseRepo.save(currentDefault.setDefault(false));
      }
    }

    const warehouseRes = Warehouse.create({
      id: command.id,
      tenantId: command.tenantId,
      code: command.code,
      name: command.name,
      isDefault: command.isDefault,
      address: command.address,
    });

    if (!warehouseRes.ok) {
      return err(warehouseRes.error);
    }

    await this.warehouseRepo.save(warehouseRes.value);

    return ok({ warehouseId: warehouseRes.value.id });
  }
}
