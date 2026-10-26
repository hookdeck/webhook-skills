import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Pennylane's subscription secret is an opaque string used as-is; this one is only for tests
const SECRET = 'test_pennylane_secret_8f3a1c';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.PENNYLANE_WEBHOOK_SECRET = SECRET;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/pennylane/route'));
});

afterEach(() => {
  delete process.env.PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS;
  logSpy.mockClear();
});

function v1For(body: string, timestamp: number, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function sign(body: string, timestamp = Math.floor(Date.now() / 1000), secret = SECRET): string {
  return `t=${timestamp},v1=${v1For(body, timestamp, secret)}`;
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-pennylane-signature'] = signature;
  return POST(new NextRequest('http://localhost:3000/webhooks/pennylane', { method: 'POST', headers, body }));
}

function envelope(event: string, object: unknown, previous?: unknown): string {
  return JSON.stringify({
    id: 987654,
    event,
    retry_count: 0,
    created: 1657875952,
    data: {
      context: { company_id: 12345, firm_id: 678 },
      object,
      ...(previous ? { previous_attributes: previous } : {}),
    },
  });
}

const invoiceUpdated = envelope(
  'customer_invoice.e_invoicing_status_updated',
  { id: 555001, e_invoicing: { status: 'accepted' } },
  { e_invoicing: { status: 'submitted' } }
);

describe('Pennylane webhook signature verification', () => {
  it('accepts a valid X-Pennylane-Signature', async () => {
    const res = await post(invoiceUpdated, sign(invoiceUpdated));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(invoiceUpdated, sign(invoiceUpdated), 'text/plain')).status).toBe(200);
  });

  it('allows a space after the comma and uppercase hex', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = `t=${ts}, v1=${v1For(invoiceUpdated, ts).toUpperCase()}`;
    expect((await post(invoiceUpdated, header)).status).toBe(200);
  });

  it('accepts when any v1 matches (defensive parsing)', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const stale = v1For(invoiceUpdated, ts, 'old_secret');
    const fresh = v1For(invoiceUpdated, ts);
    expect((await post(invoiceUpdated, `t=${ts},v1=${stale},v1=${fresh}`)).status).toBe(200);
    expect((await post(invoiceUpdated, `t=${ts},v1=${fresh},v1=${stale}`)).status).toBe(200);
  });

  it('rejects when no v1 matches', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = `t=${ts},v1=${v1For(invoiceUpdated, ts, 'a')},v1=${v1For(invoiceUpdated, ts, 'b')}`;
    expect((await post(invoiceUpdated, header)).status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(invoiceUpdated)).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    expect((await post(invoiceUpdated.replace('accepted', 'refused'), sign(invoiceUpdated))).status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await post(invoiceUpdated, sign(invoiceUpdated, undefined, 'other_secret'))).status).toBe(400);
  });

  it('rejects a v1 of the wrong length without throwing', async () => {
    expect((await post(invoiceUpdated, 't=1700000000,v1=abc')).status).toBe(400);
  });

  it('rejects a 64-char v1 that is not hex', async () => {
    expect((await post(invoiceUpdated, `t=1700000000,v1=${'z'.repeat(64)}`)).status).toBe(400);
  });

  it('rejects a non-ASCII v1 with 400, not 500', async () => {
    expect((await post(invoiceUpdated, `t=1700000000,v1=${'é'.repeat(32)}`)).status).toBe(400);
  });

  it('rejects a header with no t or no v1', async () => {
    const ts = Math.floor(Date.now() / 1000);
    expect((await post(invoiceUpdated, `v1=${v1For(invoiceUpdated, ts)}`)).status).toBe(400);
    expect((await post(invoiceUpdated, `t=${ts}`)).status).toBe(400);
    expect((await post(invoiceUpdated, 'garbage')).status).toBe(400);
  });

  it('rejects when the timestamp was altered after signing', async () => {
    const header = sign(invoiceUpdated, 1700000000).replace('t=1700000000', 't=1700000001');
    expect((await post(invoiceUpdated, header)).status).toBe(400);
  });

  it('accepts an old timestamp by default (Hookdeck retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(invoiceUpdated, sign(invoiceUpdated, old))).status).toBe(200);
  });

  it('rejects an old timestamp when PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS = '300';
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(invoiceUpdated, sign(invoiceUpdated, old))).status).toBe(400);
    expect((await post(invoiceUpdated, sign(invoiceUpdated))).status).toBe(200);
  });

  it('treats a non-numeric PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(invoiceUpdated, sign(invoiceUpdated, old))).status).toBe(200);
    warn.mockRestore();
  });
});

describe('Pennylane events', () => {
  it.each([
    ['customer_invoice.e_invoicing_status_updated', { id: 1, e_invoicing: { status: 'sent' } }, 'e-invoicing status'],
    ['dms_file.created', { id: 2, created_at: '2024-01-01T00:00:00Z' }, 'DMS file 2 created'],
    ['supplier_invoice.e_invoicing_received', { id: 3, created_at: '2024-01-01T00:00:00Z' }, 'Supplier invoice 3'],
  ])('handles %s', async (event, object, expected) => {
    const body = envelope(event, object);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain(expected);
    expect(logged).not.toContain('Unhandled');
  });

  it('acknowledges an unknown event', async () => {
    const body = envelope('customer_invoice.created', { id: 9 });
    expect((await post(body, sign(body))).status).toBe(200);
    expect(logSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('Unhandled event: customer_invoice.created');
  });

  it('rejects verified but invalid JSON', async () => {
    const body = '{not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});
