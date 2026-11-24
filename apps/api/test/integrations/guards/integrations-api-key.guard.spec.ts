import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { IntegrationsApiKeyGuard } from '../../../src/auth/integrations-api-key.guard';
import { resetEnv } from '../../../src/config/env';

describe('IntegrationsApiKeyGuard', () => {
  let guard: IntegrationsApiKeyGuard;

  beforeEach(() => {
    process.env.DATA_DRIVER = 'memory';
    process.env.ALLOW_MEMORY_DRIVER = 'true';
    process.env.INTEGRATIONS_API_KEY = 'secret-test-api-key-12345';
    process.env.INTEGRATIONS_TENANT_ID = '00000000-0000-4000-8000-000000000001';
    resetEnv();
    guard = new IntegrationsApiKeyGuard();
  });

  afterEach(() => {
    delete process.env.DATA_DRIVER;
    delete process.env.ALLOW_MEMORY_DRIVER;
    delete process.env.INTEGRATIONS_API_KEY;
    delete process.env.INTEGRATIONS_TENANT_ID;
    resetEnv();
  });

  const createMockContext = (headers: Record<string, string>): ExecutionContext => {
    const req = {
      headers,
      ip: '127.0.0.1',
    };

    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  };

  it('allows access when valid Authorization Bearer header is supplied', async () => {
    const ctx = createMockContext({
      authorization: 'Bearer secret-test-api-key-12345',
    });

    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);
  });

  it('allows access when valid x-api-key header is supplied', async () => {
    const ctx = createMockContext({
      'x-api-key': 'secret-test-api-key-12345',
    });

    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);
  });

  it('throws UnauthorizedException when header is missing', async () => {
    const ctx = createMockContext({});

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when key is invalid', async () => {
    const ctx = createMockContext({
      'x-api-key': 'wrong-key',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
