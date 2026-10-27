import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/greenshades/route';
import { buildSignedContent } from '../lib/greenshades';

const SECRET = 'my-secret-hmac-key';
const TS = '2026-10-26T12:00:00Z';
const URL = 'http://localhost:3000/webhooks/greenshades';

// Independent signer: HMAC-SHA256 over timestamp + LF + body, lowercase hex
function sign(body: Buffer, timestamp: string, secret = SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from([0x0a]), body]))
    .digest('hex');
}

const body = Buffer.from(JSON.stringify({ eventName: 'employee.updated', employeeId: 42 }));
const signed = (buf: Buffer, ts = TS) => ({ 'x-gs-timestamp': ts, 'x-gs-signature': sign(buf, ts) });

function makeRequest(method: string, buf: Buffer | null, headers: Record<string, string> = {}) {
  return new NextRequest(URL, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: buf && buf.length > 0 && method !== 'GET' ? new Uint8Array(buf) : undefined
  });
}

describe('Greenshades webhook', () => {
  beforeEach(() => {
    process.env.GREENSHADES_WEBHOOK_SECRET = SECRET;
    delete process.env.GREENSHADES_WEBHOOK_TOLERANCE_SECONDS;
  });

  it('joins timestamp and body with a real 0x0A byte, not backslash-n', () => {
    const content = buildSignedContent(TS, body);
    expect(content.includes(0x0a)).toBe(true);
    expect(content.includes(Buffer.from('\\n'))).toBe(false);
    expect(content.subarray(0, TS.length + 1).toString('latin1')).toBe(`${TS}\n`);
    expect(content.subarray(TS.length + 1).equals(body)).toBe(true);
  });

  it.each([
    ['POST', POST],
    ['PUT', PUT],
    ['PATCH', PATCH]
  ])('accepts a signed %s', async (method, handler) => {
    const res = await handler(makeRequest(method, body, signed(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it.each([
    ['GET', GET],
    ['DELETE', DELETE]
  ])('accepts a signed %s with an empty body', async (method, handler) => {
    const empty = Buffer.alloc(0);
    const res = await handler(makeRequest(method, empty, signed(empty)));
    expect(res.status).toBe(200);
  });

  it('accepts any content type (raw bytes are verified)', async () => {
    const text = Buffer.from('{"eventName":"payRun.completed"}');
    const res = await POST(makeRequest('POST', text, { ...signed(text), 'content-type': 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const h = signed(body);
    h['x-gs-signature'] = h['x-gs-signature'].toUpperCase();
    expect((await POST(makeRequest('POST', body, h))).status).toBe(200);
  });

  it('signs the UTF-8 body bytes for a non-ASCII body', async () => {
    const utf8 = Buffer.from(JSON.stringify({ eventName: 'employee.added', name: 'Zoë Müller' }), 'utf8');
    expect((await POST(makeRequest('POST', utf8, signed(utf8)))).status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    expect((await POST(makeRequest('POST', body, { 'x-gs-timestamp': TS }))).status).toBe(401);
  });

  it('rejects a missing timestamp', async () => {
    expect((await POST(makeRequest('POST', body, { 'x-gs-signature': sign(body, TS) }))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(makeRequest('POST', Buffer.from('{"eventName":"employee.added"}'), signed(body)));
    expect(res.status).toBe(401);
  });

  it('rejects a different timestamp', async () => {
    const res = await POST(makeRequest('POST', body, { ...signed(body), 'x-gs-timestamp': '2026-10-26T12:00:01Z' }));
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with a literal backslash-n separator', async () => {
    const bad = crypto
      .createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from(`${TS}\\n`), body]))
      .digest('hex');
    const res = await POST(makeRequest('POST', body, { 'x-gs-timestamp': TS, 'x-gs-signature': bad }));
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await POST(makeRequest('POST', body, { 'x-gs-timestamp': TS, 'x-gs-signature': sign(body, TS, 'other') }));
    expect(res.status).toBe(401);
  });

  it.each([
    ['too short', 'ab'.repeat(31)],
    ['too long', 'ab'.repeat(33)],
    ['non-hex', 'zz'.repeat(32)],
    ['prefixed', `sha256=${'ab'.repeat(32)}`]
  ])('rejects a malformed signature (%s)', async (_label, sig) => {
    const res = await POST(makeRequest('POST', body, { 'x-gs-timestamp': TS, 'x-gs-signature': sig }));
    expect(res.status).toBe(401);
  });

  describe('timestamp tolerance (opt-in)', () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 3600);

    it('is off by default: an old timestamp is accepted', async () => {
      expect((await POST(makeRequest('POST', body, signed(body, oldTs)))).status).toBe(200);
    });

    it('rejects an old timestamp when enabled', async () => {
      process.env.GREENSHADES_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await POST(makeRequest('POST', body, signed(body, oldTs)))).status).toBe(401);
    });

    it('accepts a fresh timestamp when enabled', async () => {
      process.env.GREENSHADES_WEBHOOK_TOLERANCE_SECONDS = '300';
      const fresh = String(Math.floor(Date.now() / 1000));
      expect((await POST(makeRequest('POST', body, signed(body, fresh)))).status).toBe(200);
    });
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const b = Buffer.from('not json');
    expect((await POST(makeRequest('POST', b, signed(b)))).status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.GREENSHADES_WEBHOOK_SECRET;
    expect((await POST(makeRequest('POST', body, signed(body)))).status).toBe(500);
  });
});
