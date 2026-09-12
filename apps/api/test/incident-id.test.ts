import { describe, expect, it, vi } from 'vitest';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { INCIDENT_ID_PATTERN } from '@corebiz/contracts';
import { AllExceptionsFilter } from '../src/http/all-exceptions.filter';

/**
 * The incident reference.
 *
 * It exists for a very specific reason: a 500 reaches the browser WITHOUT any detail — and
 * must stay that way, because the Postgres message contains table names and sometimes the
 * failing value — but then whoever suffers it has nothing to give support, and support has
 * no way to find it in the log. The reference is the only thing joining the two halves, so
 * these tests watch both: that it travels, and that nothing else does. Neither to the
 * browser nor to the log.
 */

interface Captured {
  status: number | null;
  body: unknown;
  headers: Record<string, string>;
  ended: boolean;
}

interface Options {
  readonly headersSent?: boolean;
  readonly originalUrl?: string;
  readonly userId?: string;
}

function doubles({
  headersSent = false,
  originalUrl = '/v1/customers',
  userId = 'verified-user',
}: Options = {}) {
  const captured: Captured = { status: null, body: null, headers: {}, ended: false };

  const res = {
    headersSent,
    setHeader: (k: string, v: string) => {
      captured.headers[k.toLowerCase()] = v;
    },
    status: (code: number) => {
      captured.status = code;
      return res;
    },
    json: (body: unknown) => {
      captured.body = body;
      return res;
    },
    end: () => {
      captured.ended = true;
      return res;
    },
  };

  const req = {
    method: 'POST',
    originalUrl,
    // What `AuthMiddleware` leaves after verifying the token signature.
    auth: { userId, email: null },
    header: (name: string) => (name === 'x-corebiz-tenant' ? 'tenant-abc' : undefined),
  };

  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;

  return { captured, host };
}

/**
 * Silences Nest's logger and returns what it was given.
 *
 * `Logger.prototype` is spied rather than the filter's field: `logger` is an INSTANCE
 * property created in the constructor, so it does not exist on the prototype and every
 * `new AllExceptionsFilter()` makes its own.
 */
function capturingTheLog(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => {
    lines.push(String(message));
  });
  return { lines, restore: () => spy.mockRestore() };
}

describe('incident reference', () => {
  it('names the unexpected and returns it in the body and in a header', () => {
    const { captured, host } = doubles();
    const log = capturingTheLog();

    new AllExceptionsFilter().catch(new Error('boom'), host);
    log.restore();

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);

    const body = captured.body as { errorKind: string; errorParams: { incidentId?: string } };
    expect(body.errorKind).toBe('Unexpected');
    // The SAME pattern the web uses to accept the reference back. If the filter changed
    // format without changing the contract, the web would silently drop every reference,
    // and this test is what would say so.
    expect(body.errorParams.incidentId).toMatch(INCIDENT_ID_PATTERN);

    // In a header AS WELL as the body: web reads discard a failure's body, and without the
    // header a broken screen would leave no trace.
    expect(captured.headers['x-corebiz-incident']).toBe(body.errorParams.incidentId);
  });

  it('logs the reference first, then the path, the verified user and the REQUESTED company', () => {
    const { captured, host } = doubles();
    const log = capturingTheLog();

    new AllExceptionsFilter().catch(new Error('boom'), host);
    log.restore();

    const body = captured.body as { errorParams: { incidentId: string } };
    const line = log.lines.join('\n');

    // The reference goes FIRST so a `grep` over the production log finds it unambiguously:
    // it is the only link between the screen and the trace.
    expect(line.startsWith(body.errorParams.incidentId)).toBe(true);
    expect(line).toContain('POST');
    expect(line).toContain('/v1/customers');
    expect(line).toContain('user=verified-user');

    // The company header is sent by the client. It is logged, but labelled as what it is:
    // a bare `tenant=` would present as fact something anyone can write.
    expect(line).toContain('tenantPedido=tenant-abc');
    expect(line).not.toMatch(/\stenant=/);
  });

  it('keeps the query string OUT of the log: credentials travel in it', () => {
    /*
     * `GET /v1/invitations/preview?token=` carries an invitation token in clear, and
     * whoever holds it joins the company. The database only stores its hash; if a 500 on
     * that endpoint wrote it here, the log would be the back door. `?search=` is the same
     * on a smaller scale: it is a customer name.
     */
    const { host } = doubles({
      originalUrl: '/v1/invitations/preview?token=INVITATION-SECRET&search=Bodega',
    });
    const log = capturingTheLog();

    new AllExceptionsFilter().catch(new Error('boom'), host);
    log.restore();

    const line = log.lines.join('\n');
    expect(line).toContain('/v1/invitations/preview');
    expect(line).not.toContain('INVITATION-SECRET');
    expect(line).not.toContain('Bodega');
    expect(line).not.toContain('?');
  });

  it('says so when there is no verified identity instead of inventing one', () => {
    const { host } = doubles({ userId: undefined as unknown as string });
    const log = capturingTheLog();

    // Routes that require no token — `/health`, `/internal/*` — can fail too.
    const withoutAuth = host.switchToHttp().getRequest<{ auth?: unknown }>();
    delete withoutAuth.auth;

    new AllExceptionsFilter().catch(new Error('boom'), host);
    log.restore();

    expect(log.lines.join('\n')).toContain('user=-');
  });

  it('does NOT leak the exception message into the response body', () => {
    const { captured, host } = doubles();
    const log = capturingTheLog();

    // A real Postgres error: it contains the table name and the value.
    new AllExceptionsFilter().catch(
      new Error('duplicate key value violates unique constraint "customers_tenant_id_code_key"'),
      host,
    );
    log.restore();

    const serialized = JSON.stringify(captured.body);
    expect(serialized).not.toContain('customers_tenant_id_code_key');
    expect(serialized).not.toContain('duplicate key');
    expect(JSON.parse(serialized)).toEqual({
      errorKind: 'Unexpected',
      errorParams: { incidentId: expect.stringMatching(INCIDENT_ID_PATTERN) },
    });
  });

  it('never gives two incidents the same reference', () => {
    const log = capturingTheLog();
    const ids = new Set<string>();

    for (let i = 0; i < 50; i++) {
      const { captured, host } = doubles();
      new AllExceptionsFilter().catch(new Error('boom'), host);
      ids.add((captured.body as { errorParams: { incidentId: string } }).errorParams.incidentId);
    }
    log.restore();

    expect(ids.size).toBe(50);
  });

  it('passes an exception that ALREADY carries an envelope through untouched, without a reference', () => {
    // A business error is not an incident: it explains itself, and a support reference
    // would invite people to report something that works as intended.
    const { captured, host } = doubles();

    new AllExceptionsFilter().catch(new ForbiddenException(), host);

    expect(captured.status).toBe(403);
    expect(captured.body).toEqual({ errorKind: 'Forbidden', errorParams: {} });
    expect(captured.headers['x-corebiz-incident']).toBeUndefined();
  });

  it('ends the stream instead of responding when headers were already sent', () => {
    /*
     * The streaming case: the response had already started. Writing a status here throws
     * ERR_HTTP_HEADERS_SENT INSIDE the error handler, and that second error hides the first
     * — the only one that explains anything.
     */
    const { captured, host } = doubles({ headersSent: true });
    const log = capturingTheLog();

    expect(() => new AllExceptionsFilter().catch(new Error('mid-stream'), host)).not.toThrow();
    log.restore();

    expect(captured.ended).toBe(true);
    expect(captured.status).toBeNull();
    expect(captured.body).toBeNull();

    // The error is still logged: what is lost is the response, not the trace.
    expect(log.lines).toHaveLength(1);
  });

  it('also ends the stream when what failed was already an HttpException', () => {
    const { captured, host } = doubles({ headersSent: true });
    const log = capturingTheLog();

    new AllExceptionsFilter().catch(new HttpException('x', 409), host);
    log.restore();

    expect(captured.ended).toBe(true);
    expect(captured.status).toBeNull();
  });
});
