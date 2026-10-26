import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// The signing secret is used as-is (UTF-8 bytes, not decoded); this one is only for tests
const SECRET = 'test_column_signing_secret_7c1d';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.COLUMN_WEBHOOK_SECRET = SECRET;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/column/route'));
});

// Column-Signature: lowercase hex HMAC-SHA256 of the raw body, no prefix
function sign(body: string, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['column-signature'] = signature;
  return POST(new NextRequest('http://localhost:3000/webhooks/column', { method: 'POST', headers, body }));
}

const completed = JSON.stringify({
  id: 'evnt_2abc',
  type: 'ach.outgoing_transfer.completed',
  created_at: '2026-10-26T12:00:00Z',
  data: { id: 'acht_1xyz', amount: 1000, currency_code: 'USD' },
});

describe('Column webhook signature verification', () => {
  it('accepts a valid Column-Signature', async () => {
    const res = await post(completed, sign(completed));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(completed, sign(completed), 'text/plain')).status).toBe(200);
  });

  it('verifies the exact bytes, including whitespace a JSON round trip would drop', async () => {
    const pretty = JSON.stringify(JSON.parse(completed), null, 2);
    expect((await post(pretty, sign(pretty))).status).toBe(200);
    expect((await post(pretty, sign(completed))).status).toBe(401);
  });

  it('accepts uppercase hex', async () => {
    expect((await post(completed, sign(completed).toUpperCase())).status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(completed, undefined)).status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    expect((await post(completed, '')).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(completed.replace('1000', '9999'), sign(completed))).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await post(completed, sign(completed, 'other_secret'))).status).toBe(401);
  });

  it('rejects a value that is not 64 hex chars without throwing', async () => {
    expect((await post(completed, 'abc')).status).toBe(401);
    expect((await post(completed, 'zz'.repeat(32))).status).toBe(401);
    expect((await post(completed, sign(completed) + 'aa')).status).toBe(401);
    // Buffer.from(x, 'hex') would silently truncate this to the valid prefix
    expect((await post(completed, sign(completed).slice(0, 62) + 'zz')).status).toBe(401);
  });

  it('rejects a prefixed or base64 signature', async () => {
    expect((await post(completed, `sha256=${sign(completed)}`)).status).toBe(401);
    const b64 = crypto.createHmac('sha256', SECRET).update(completed).digest('base64');
    expect((await post(completed, b64)).status).toBe(401);
  });

  it('accepts an old event (no timestamp is signed, so there is no replay window)', async () => {
    const old = JSON.stringify({ ...JSON.parse(completed), created_at: '2020-01-01T00:00:00Z' });
    expect((await post(old, sign(old))).status).toBe(200);
  });
});

describe('Column events', () => {
  it.each([
    'ach.outgoing_transfer.completed',
    'ach.outgoing_transfer.returned',
    'book.transfer.completed',
  ])('handles %s', async (type) => {
    logSpy.mockClear();
    const body = JSON.stringify({ id: 'evnt_1', type, data: { id: 'obj_1' } });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(logSpy.mock.calls.map((c) => c[0]).join('\n')).not.toContain('Unhandled');
  });

  it('acknowledges an unhandled type', async () => {
    logSpy.mockClear();
    const body = JSON.stringify({ id: 'evnt_1', type: 'book.transfer.hold_created' });
    expect((await post(body, sign(body))).status).toBe(200);
    expect(logSpy.mock.calls.map((c) => c[0]).join('\n')).toContain('Unhandled event: book.transfer.hold_created');
  });

  it('rejects verified but invalid JSON', async () => {
    const body = '{not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});
