import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/webhooks/freemius/route';

const SECRET = 'sk_test_freemius_product_secret_key';

// Same algorithm as Freemius: bare hex HMAC-SHA256 of the raw body, key = secret as UTF-8
function sign(body: string | Buffer, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/freemius', { method: 'POST', headers, body });
}

describe('Freemius webhook', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.FREEMIUS_WEBHOOK_SECRET = SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    'license.activated',
    'license.created',
    'license.cancelled',
    'subscription.created',
    'subscription.cancelled',
    'payment.created',
    'payment.refund',
    'user.created',
  ])('accepts a validly signed %s event', async (type) => {
    const body = JSON.stringify({ id: 42, type, objects: { license: { id: 7 } } });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('acknowledges event types it does not handle', async () => {
    const body = JSON.stringify({ id: 1, type: 'affiliate.approved' });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled Freemius event type: affiliate.approved');
  });

  it('verifies the exact bytes, not re-serialised JSON', async () => {
    const body = '{ "type" :  "license.activated",\n  "id": 1 }';
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
    expect((await POST(makeRequest(body, sign(JSON.stringify(JSON.parse(body)))))).status).toBe(401);
  });

  it('verifies non-ASCII bodies as bytes', async () => {
    const body = JSON.stringify({ type: 'user.created', id: 1, name: 'Zoë 日本語' });
    expect((await POST(makeRequest(body, sign(Buffer.from(body, 'utf8'))))).status).toBe(200);
  });

  it('works with any content type', async () => {
    const body = JSON.stringify({ type: 'license.activated', id: 1 });
    expect((await POST(makeRequest(body, sign(body), 'text/plain'))).status).toBe(200);
  });

  it('accepts uppercase hex (compared case-insensitively)', async () => {
    const body = JSON.stringify({ type: 'license.activated', id: 1 });
    expect((await POST(makeRequest(body, sign(body).toUpperCase()))).status).toBe(200);
  });

  describe('rejects with 401', () => {
    const body = JSON.stringify({ type: 'license.activated', id: 1 });
    const good = sign(body);

    it('a missing signature header', async () => {
      expect((await POST(makeRequest(body))).status).toBe(401);
    });
    it('an empty signature header', async () => {
      expect((await POST(makeRequest(body, ''))).status).toBe(401);
    });
    it('a signature made with the wrong secret', async () => {
      expect((await POST(makeRequest(body, sign(body, 'other_secret')))).status).toBe(401);
    });
    it('a tampered body', async () => {
      expect((await POST(makeRequest(body.replace('1', '2'), good))).status).toBe(401);
    });
    it('a truncated signature', async () => {
      expect((await POST(makeRequest(body, good.slice(0, 62)))).status).toBe(401);
    });
    it('a signature with a sha256= prefix', async () => {
      expect((await POST(makeRequest(body, `sha256=${good}`))).status).toBe(401);
    });
    it('64 characters that are not all hex', async () => {
      expect((await POST(makeRequest(body, `${good.slice(0, 63)}z`))).status).toBe(401);
    });
    it('an empty body', async () => {
      expect((await POST(makeRequest('', good))).status).toBe(401);
    });
  });

  describe('after a valid signature', () => {
    it('returns 400 for invalid JSON', async () => {
      const body = 'not json';
      expect((await POST(makeRequest(body, sign(body)))).status).toBe(400);
    });
    it.each(['null', '42', '"text"', '[]', '{}', '{"type":5}'])('returns 400 for body %s', async (body) => {
      expect((await POST(makeRequest(body, sign(body)))).status).toBe(400);
    });
    it('ignores wrong-typed nested fields instead of failing', async () => {
      for (const extra of [{ objects: 'x' }, { objects: null }, { objects: [1] }, { id: { a: 1 } }]) {
        const body = JSON.stringify({ type: 'license.activated', ...extra });
        expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
      }
    });
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.FREEMIUS_WEBHOOK_SECRET;
    const body = '{"type":"license.activated"}';
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(500);
  });
});
