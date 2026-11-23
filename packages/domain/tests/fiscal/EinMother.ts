import { Ein } from '../../src/fiscal/value-objects/ein';

export class EinMother {
  static create(raw = '12-3456789'): Ein {
    const result = Ein.create(raw);
    if (!result.ok) {
      throw new Error(`Failed to create Ein: ${JSON.stringify(result.error)}`);
    }
    return result.value;
  }
}
