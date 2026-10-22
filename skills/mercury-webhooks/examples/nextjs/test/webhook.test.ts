import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Mercury's secretKey is an opaque string used as-is; this one is only for tests
const SECRET = 'test_mercury_secret_key_8f3a1c';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.MERCURY_WEBHOOK_SECRET = SECRET;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/mercury/route'));
});

afterEach(() => {
  delete process.env.MERCURY_TIMESTAMP_TOLERANCE_SECONDS;
  logSpy.mockClear();
});

function sign(body: string, timestamp = Math.floor(Date.now() / 1000), secret = SECRET): string {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['mercury-signature'] = signature;
  return POST(new NextRequest('http://localhost:3000/webhooks/mercury', { method: 'POST', headers, body }));
}

const txUpdate = JSON.stringify({
  id: 'bfa85eaa-afab-11f0-8fea-17d650f2306e',
  resourceType: 'transaction',
  resourceId: '1d3042b6-af63-11f0-89d2-3503f2fcfef7',
  operationType: 'update',
  resourceVersion: 2,
  occurredAt: '2025-01-01T00:00:00.000000Z',
  changedPaths: ['status', 'postedAt'],
  mergePatch: { postedAt: '2025-01-01T00:00:00.000000+00:00', status: 'sent' },
  previousValues: { postedAt: null, status: 'pending' },
});

describe('Mercury webhook signature verification', () => {
  it('accepts a valid Mercury-Signature', async () => {
    const res = await post(txUpdate, sign(txUpdate));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(txUpdate, sign(txUpdate), 'text/plain')).status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(txUpdate)).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    expect((await post(txUpdate.replace('sent', 'failed'), sign(txUpdate))).status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await post(txUpdate, sign(txUpdate, undefined, 'other_secret'))).status).toBe(400);
  });

  it('rejects a signature of a different length without throwing', async () => {
    expect((await post(txUpdate, 't=1700000000,v1=abc')).status).toBe(400);
  });

  it('rejects a malformed header', async () => {
    expect((await post(txUpdate, 'garbage')).status).toBe(400);
    expect((await post(txUpdate, 't=abc,v1=deadbeef')).status).toBe(400);
  });

  it('rejects when the timestamp was altered after signing', async () => {
    const header = sign(txUpdate, 1700000000).replace('t=1700000000', 't=1700000001');
    expect((await post(txUpdate, header)).status).toBe(400);
  });

  it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(txUpdate, sign(txUpdate, old))).status).toBe(200);
  });

  it('rejects an old timestamp when MERCURY_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.MERCURY_TIMESTAMP_TOLERANCE_SECONDS = '300';
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(txUpdate, sign(txUpdate, old))).status).toBe(400);
    expect((await post(txUpdate, sign(txUpdate))).status).toBe(200);
  });

  it('treats a non-numeric MERCURY_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.MERCURY_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(txUpdate, sign(txUpdate, old))).status).toBe(200);
    warn.mockRestore();
  });
});

describe('Mercury events (dispatch on resourceType.operationType)', () => {
  it.each([
    ['transaction', 'create'],
    ['transaction', 'update'],
    ['checkingAccount', 'update'],
    ['savingsAccount', 'update'],
    ['treasuryAccount', 'update'],
    ['creditAccount', 'update'],
    ['investmentAccount', 'update'],
    ['transaction', 'delete'],
  ])('handles %s.%s', async (resourceType, operationType) => {
    const body = JSON.stringify({
      id: 'e1', resourceType, resourceId: 'r1', operationType,
      changedPaths: ['status'], mergePatch: { status: 'pending' },
    });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    if (operationType === 'delete') expect(logged).toContain(`Unhandled event: ${resourceType}.delete`);
    else expect(logged).not.toContain('Unhandled');
  });

  it('rejects verified but invalid JSON', async () => {
    const body = '{not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});
