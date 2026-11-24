import { type PartnerDrawing, type PartnerDrawingRepository } from '../../domain/index';

export class InMemoryPartnerDrawingRepository implements PartnerDrawingRepository {
  private readonly drawings = new Map<string, PartnerDrawing>();

  findById(tenantId: string, id: string): Promise<PartnerDrawing | null> {
    const drawing = this.drawings.get(id);
    if (!drawing || drawing.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(drawing);
  }

  nextDrawingNumber(tenantId: string): Promise<bigint> {
    let max = 0n;
    for (const drawing of this.drawings.values()) {
      if (drawing.tenantId === tenantId && drawing.drawingNumber > max) {
        max = drawing.drawingNumber;
      }
    }
    return Promise.resolve(max + 1n);
  }

  listByTenant(tenantId: string): Promise<readonly PartnerDrawing[]> {
    const results: PartnerDrawing[] = [];
    for (const drawing of this.drawings.values()) {
      if (drawing.tenantId === tenantId) {
        results.push(drawing);
      }
    }
    results.sort((a, b) => b.date.getTime() - a.date.getTime());
    return Promise.resolve(results);
  }

  save(drawing: PartnerDrawing): Promise<void> {
    this.drawings.set(drawing.id, drawing);
    return Promise.resolve();
  }

  clear(): void {
    this.drawings.clear();
  }
}
