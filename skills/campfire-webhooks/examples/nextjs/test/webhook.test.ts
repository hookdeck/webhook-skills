import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/campfire/route';

const SECRET = 'k3Jx9QmVt2LwZp8RaYb5NcHd7UfGs1EoXi4TyWn6AvBq0CrMlD'; // 50-char Campfire token

// Same algorithm as Campfire: HMAC-SHA256(secret, "{timestamp}:{raw body}"), hex.
function sign(body: string, timestamp: string, secret = SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from(':'), Buffer.from(body)]))
    .digest('hex');
}

const nowTs = () => String(Math.floor(Date.now() / 1000));

interface Opts {
  timestamp?: string | null;
  signature?: string | null;
  contentType?: string;
}

function makeRequest(body: string, { timestamp = nowTs(), signature, contentType = 'application/json' }: Opts = {}) {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (timestamp !== null) headers['campfire-webhook-request-timestamp'] = timestamp;
  const sig = signature === undefined ? sign(body, timestamp ?? '') : signature;
  if (sig !== null) headers['campfire-webhook-signature-v1'] = sig;
  return new NextRequest('http://localhost:3000/webhooks/campfire', { method: 'POST', headers, body });
}

const invoicePaid = JSON.stringify({
  webhook_uuid: '3c88df19-1c1f-4b1c-b4a7-768793055a60',
  topic: 'Invoice.paid',
  data: { id: 12345, invoice_number: 'INV-1042', payment_status: 'paid', amount_paid: 1500.0 },
  changes: { payment_status: { old: 'open', new: 'paid' } },
});

describe('Campfire webhook route', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.CAMPFIRE_WEBHOOK_SECRET = SECRET;
    delete process.env.CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a valid signature and handles Invoice.paid', async () => {
    const res = await POST(makeRequest(invoicePaid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith('Invoice paid: 12345');
  });

  it('handles Invoice.created, Bill.created and logs unknown topics', async () => {
    const cases: [string, string][] = [
      ['Invoice.created', 'Invoice created: 7 (INV-7)'],
      ['Bill.created', 'Bill created: 7'],
      ['Contract.updated', 'Unhandled Campfire topic: Contract.updated'],
    ];
    for (const [topic, line] of cases) {
      const body = JSON.stringify({ webhook_uuid: 'u', topic, data: { id: 7, invoice_number: 'INV-7' }, changes: null });
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(line);
    }
  });

  it('handles *.deleted payloads that carry only an id', async () => {
    const body = JSON.stringify({ webhook_uuid: 'u', topic: 'Bill.deleted', data: { id: 99 }, changes: null });
    expect((await POST(makeRequest(body))).status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Bill.deleted: 99');
  });

  it('verifies the exact bytes whatever the content type', async () => {
    expect((await POST(makeRequest(invoicePaid, { contentType: 'text/plain' }))).status).toBe(200);
  });

  it('verifies a body with unusual whitespace and key order untouched', async () => {
    const body = '{ "topic" :"Invoice.paid",\n "data":{"id":1},  "changes":null }';
    expect((await POST(makeRequest(body))).status).toBe(200);
  });

  it('accepts uppercase hex (compared case-insensitively)', async () => {
    const ts = nowTs();
    const res = await POST(makeRequest(invoicePaid, { timestamp: ts, signature: sign(invoicePaid, ts).toUpperCase() }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing or empty signature header', async () => {
    expect((await POST(makeRequest(invoicePaid, { signature: null }))).status).toBe(401);
    expect((await POST(makeRequest(invoicePaid, { signature: '' }))).status).toBe(401);
  });

  it('rejects a missing or empty timestamp header', async () => {
    const sig = sign(invoicePaid, '1770000000');
    expect((await POST(makeRequest(invoicePaid, { timestamp: null, signature: sig }))).status).toBe(401);
    expect((await POST(makeRequest(invoicePaid, { timestamp: '', signature: sig }))).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const ts = nowTs();
    const res = await POST(makeRequest(invoicePaid, { timestamp: ts, signature: sign(invoicePaid, ts, 'x'.repeat(50)) }));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const ts = nowTs();
    const res = await POST(makeRequest(invoicePaid.replace('1500', '1'), { timestamp: ts, signature: sign(invoicePaid, ts) }));
    expect(res.status).toBe(401);
  });

  it('rejects when the timestamp header does not match what was signed', async () => {
    const res = await POST(makeRequest(invoicePaid, { timestamp: nowTs(), signature: sign(invoicePaid, '1770000000') }));
    expect(res.status).toBe(401);
  });

  it('rejects a dot-joined message (the separator is a colon)', async () => {
    const ts = nowTs();
    const dotSig = crypto.createHmac('sha256', SECRET).update(`${ts}.${invoicePaid}`).digest('hex');
    expect((await POST(makeRequest(invoicePaid, { timestamp: ts, signature: dotSig }))).status).toBe(401);
  });

  it('rejects prefixed, truncated, non-hex and over-long signatures', async () => {
    const ts = nowTs();
    const good = sign(invoicePaid, ts);
    for (const bad of [`sha256=${good}`, good.slice(0, 62), good + 'aa', 'z'.repeat(64), `${good.slice(0, 63)}g`]) {
      expect((await POST(makeRequest(invoicePaid, { timestamp: ts, signature: bad }))).status).toBe(401);
    }
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    expect((await POST(makeRequest('not json'))).status).toBe(400);
  });

  it('does not reject old timestamps by default (retries and replays keep them)', async () => {
    expect((await POST(makeRequest(invoicePaid, { timestamp: '1770000000' }))).status).toBe(200);
  });

  it('rejects old timestamps when CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
    process.env.CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await POST(makeRequest(invoicePaid, { timestamp: '1770000000' }))).status).toBe(401);
    expect((await POST(makeRequest(invoicePaid))).status).toBe(200);
  });
});
