import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { type Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { InMemoryIdempotencyStore, type IdempotencyStorePort } from '@corebiz/application';

const globalIdempotencyStore: IdempotencyStorePort = new InMemoryIdempotencyStore();

export function getIdempotencyStore(): IdempotencyStorePort {
  return globalIdempotencyStore;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly store: IdempotencyStorePort = globalIdempotencyStore) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const method = req.method.toUpperCase();
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
      return next.handle();
    }

    const rawKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';

    if (!key) {
      throw new BadRequestException({
        errorKind: 'MissingIdempotencyKey',
        errorParams: {},
      });
    }

    const existing = await this.store.get(key);
    if (existing) {
      if (existing.status === 'pending') {
        throw new ConflictException({
          errorKind: 'IdempotencyConflict',
          errorParams: { key },
        });
      }
      res.status(existing.statusCode);
      return of(existing.body);
    }

    await this.store.set(key, {
      status: 'pending',
      statusCode: 0,
      body: null,
      createdAt: new Date().toISOString(),
    });

    return next.handle().pipe(
      tap({
        next: (body) => {
          const statusCode = res.statusCode || 201;
          void this.store.set(key, {
            status: 'completed',
            statusCode,
            body,
            createdAt: new Date().toISOString(),
          });
        },
      }),
    );
  }
}
