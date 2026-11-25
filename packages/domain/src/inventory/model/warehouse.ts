import { ok, err, type Result } from '../../shared/result';

export interface WarehouseProps {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly isDefault?: boolean | undefined;
  readonly isActive?: boolean | undefined;
  readonly address?: string | undefined;
}

export interface WarehouseError {
  readonly kind: 'WarehouseCodeRequired' | 'WarehouseNameRequired';
}

export class Warehouse {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly isActive: boolean;
  readonly address?: string | undefined;

  private constructor(props: WarehouseProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.code = props.code;
    this.name = props.name;
    this.isDefault = props.isDefault ?? false;
    this.isActive = props.isActive ?? true;
    this.address = props.address;
  }

  static create(props: WarehouseProps): Result<Warehouse, WarehouseError> {
    const trimmedCode = props.code.trim().toUpperCase();
    if (trimmedCode.length === 0) {
      return err({ kind: 'WarehouseCodeRequired' });
    }

    const trimmedName = props.name.trim();
    if (trimmedName.length === 0) {
      return err({ kind: 'WarehouseNameRequired' });
    }

    return ok(
      new Warehouse({
        ...props,
        code: trimmedCode,
        name: trimmedName,
      }),
    );
  }

  deactivate(): Warehouse {
    return new Warehouse({
      ...this,
      isActive: false,
    });
  }

  activate(): Warehouse {
    return new Warehouse({
      ...this,
      isActive: true,
    });
  }

  setDefault(isDefault: boolean): Warehouse {
    return new Warehouse({
      ...this,
      isDefault,
    });
  }
}
