import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { of, lastValueFrom, type Observable } from 'rxjs';
import { IdempotencyInterceptor } from '../../../src/auth/idempotency.interceptor';
import { InMemoryIdempotencyStore } from '@corebiz/application';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
    interceptor = new IdempotencyInterceptor(store);
  });

  const createMockContext = (method: string, headers: Record<string, string>): ExecutionContext => {
    const req = {
      method,
      headers,
    };
    const res = {
      statusCode: 201,
      status: vi.fn().mockReturnThis(),
    };

    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;
  };

  const createMockHandler = (handleFn: unknown): CallHandler => ({
    handle: handleFn as () => Observable<unknown>,
  });

  it('bypasses idempotency checks for GET requests', async () => {
    const ctx = createMockContext('GET', {});
    const handleSpy = vi.fn(() => of({ data: 'ok' }));
    const handler = createMockHandler(handleSpy);

    const result$ = await interceptor.intercept(ctx, handler);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ data: 'ok' });
    expect(handleSpy).toHaveBeenCalled();
  });

  it('throws BadRequestException when Idempotency-Key header is missing on POST requests', async () => {
    const ctx = createMockContext('POST', {});
    const handleSpy = vi.fn(() => of({ data: 'ok' }));
    const handler = createMockHandler(handleSpy);

    await expect(interceptor.intercept(ctx, handler)).rejects.toThrow(BadRequestException);
    expect(handleSpy).not.toHaveBeenCalled();
  });

  it('executes handler and saves result on first call with new idempotency key', async () => {
    const ctx = createMockContext('POST', { 'idempotency-key': 'key-abc-123' });
    const handleSpy = vi.fn(() => of({ invoiceId: 'inv-001' }));
    const handler = createMockHandler(handleSpy);

    const result$ = await interceptor.intercept(ctx, handler);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ invoiceId: 'inv-001' });
    expect(handleSpy).toHaveBeenCalledTimes(1);

    const stored = await store.get('key-abc-123');
    expect(stored).toBeDefined();
    expect(stored?.status).toBe('completed');
    expect(stored?.body).toEqual({ invoiceId: 'inv-001' });
  });

  it('returns cached response immediately without calling handler on repeated requests', async () => {
    await store.set('key-abc-123', {
      status: 'completed',
      statusCode: 201,
      body: { invoiceId: 'inv-001' },
      createdAt: new Date().toISOString(),
    });

    const ctx = createMockContext('POST', { 'idempotency-key': 'key-abc-123' });
    const handleSpy = vi.fn(() => of({ invoiceId: 'inv-different' }));
    const handler = createMockHandler(handleSpy);

    const result$ = await interceptor.intercept(ctx, handler);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ invoiceId: 'inv-001' });
    expect(handleSpy).not.toHaveBeenCalled();
  });

  it('throws ConflictException when duplicate request arrives while first is still pending', async () => {
    await store.set('key-abc-123', {
      status: 'pending',
      statusCode: 0,
      body: null,
      createdAt: new Date().toISOString(),
    });

    const ctx = createMockContext('POST', { 'idempotency-key': 'key-abc-123' });
    const handleSpy = vi.fn(() => of({ invoiceId: 'inv-001' }));
    const handler = createMockHandler(handleSpy);

    await expect(interceptor.intercept(ctx, handler)).rejects.toThrow(ConflictException);
    expect(handleSpy).not.toHaveBeenCalled();
  });
});
