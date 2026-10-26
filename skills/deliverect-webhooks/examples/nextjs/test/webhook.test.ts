import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as base from '../app/webhooks/deliverect/route';
import * as byKind from '../app/webhooks/deliverect/[kind]/route';

// Before certification Deliverect signs with the call's channelLink or locationId; after,
// with the HMAC secret from Integration settings. Any string works as the key (UTF-8 bytes).
const SECRET = 'test_hmac_secret_from_integration_settings';
const HEADER = 'x-server-authorization-hmac-sha256';
const URL_BASE = 'http://localhost:3000/webhooks/deliverect';

function sign(body: string, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function build(method: string, body: string | null, signature: string | null, contentType = 'application/json') {
  const headers: Record<string, string> = {};
  if (signature !== null) headers[HEADER] = signature;
  if (body !== null) headers['content-type'] = contentType;
  return new Request(URL_BASE, { method, headers, body });
}

// POST to the base route (no kind) or to /[kind]
function post(body: string, signature: string | null = sign(body), kind?: string) {
  const req = build('POST', body, signature);
  return kind === undefined
    ? base.POST(req)
    : byKind.POST(req, { params: Promise.resolve({ kind }) });
}

describe('Deliverect webhook', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    process.env.DELIVERECT_WEBHOOK_SECRET = SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  describe('signature verification', () => {
    const body = JSON.stringify({ orderId: 'o-1', status: 20 });

    it('accepts a valid signature', async () => {
      const res = await post(body, sign(body), 'order_status_update');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts an uppercase hex digest', async () => {
      expect((await post(body, sign(body).toUpperCase())).status).toBe(200);
    });

    it('rejects a missing header', async () => {
      expect((await post(body, null)).status).toBe(401);
    });

    it('rejects an empty header', async () => {
      expect((await post(body, '')).status).toBe(401);
    });

    it('rejects a wrong signature', async () => {
      expect((await post(body, 'a'.repeat(64))).status).toBe(401);
    });

    it('rejects a signature made with another secret', async () => {
      expect((await post(body, sign(body, 'other'))).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      expect((await post(body.replace('20', '30'), sign(body))).status).toBe(401);
    });

    it('rejects a prefixed digest', async () => {
      expect((await post(body, `sha256=${sign(body)}`)).status).toBe(401);
    });

    it('rejects a digest with the wrong length', async () => {
      expect((await post(body, sign(body).slice(0, 62))).status).toBe(401);
      expect((await post(body, `${sign(body)}00`)).status).toBe(401);
    });

    it('rejects a digest with non-hex characters', async () => {
      expect((await post(body, `${sign(body).slice(0, 62)}zz`)).status).toBe(401);
    });

    it('rejects a digest followed by junk', async () => {
      expect((await post(body, `${sign(body)} extra`)).status).toBe(401);
    });

    it('verifies the exact bytes, not a re-serialized body', async () => {
      const spaced = '{ "orderId": "o-1",  "status": 20 }';
      expect((await post(spaced, sign(spaced))).status).toBe(200);
      expect((await post(spaced, sign(body))).status).toBe(401);
    });

    it('rejects everything when no secret is configured', async () => {
      delete process.env.DELIVERECT_WEBHOOK_SECRET;
      expect((await post(body, sign(body, ''))).status).toBe(401);
    });
  });

  describe('methods', () => {
    it('accepts a signed GET with no body (HMAC over the empty string)', async () => {
      const res = await base.GET(build('GET', null, sign('')));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('rejects a GET with no signature', async () => {
      expect((await base.GET(build('GET', null, null))).status).toBe(401);
    });

    it('rejects a GET signed over something other than the empty string', async () => {
      expect((await base.GET(build('GET', null, sign('{}')))).status).toBe(401);
    });

    it('accepts a signed GET on the kind route', async () => {
      const res = await byKind.GET(build('GET', null, sign('')), { params: Promise.resolve({ kind: 'menu_update' }) });
      expect(res.status).toBe(200);
    });

    it.each(['PUT', 'PATCH', 'DELETE'] as const)('accepts a signed %s', async (method) => {
      const body = JSON.stringify({ status: 'PAUSED' });
      const res = await base[method](build(method, body, sign(body)));
      expect(res.status).toBe(200);
    });

    it('verifies any content type over the raw bytes', async () => {
      const body = '{"orderId":"o-2"}';
      const res = await base.POST(build('POST', body, sign(body), 'text/plain'));
      expect(res.status).toBe(200);
    });
  });

  describe('webhook kinds', () => {
    it('handles order status updates', async () => {
      await post(JSON.stringify({ orderId: 'o-9', status: 50 }), undefined, 'order_status_update');
      expect(logSpy).toHaveBeenCalledWith('Order o-9 status: 50');
    });

    it('handles menu updates', async () => {
      await post(JSON.stringify({ menus: [{}, {}] }), undefined, 'menu_update');
      expect(logSpy).toHaveBeenCalledWith('Menu update with 2 menu(s)');
    });

    it('handles snooze/unsnooze operations', async () => {
      const body = JSON.stringify({ operations: [{ action: 'snooze', data: { items: [{ plu: 'a' }] } }] });
      await post(body, undefined, 'snooze_unsnooze');
      expect(logSpy).toHaveBeenCalledWith('Snooze operation "snooze" for 1 item(s)');
    });

    it('handles busy mode and accepts hyphens in the kind', async () => {
      await post(JSON.stringify({ status: 'PAUSED' }), undefined, 'busy-mode');
      expect(logSpy).toHaveBeenCalledWith('Busy mode: PAUSED');
    });

    it('acknowledges an unrecognised kind', async () => {
      const res = await post(JSON.stringify({ hello: 'world' }), undefined, 'something_else');
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Deliverect call: something_else');
    });
  });

  describe('untrusted body', () => {
    it('returns 400 for invalid JSON after a valid signature', async () => {
      expect((await post('{not json')).status).toBe(400);
    });

    it.each(['[1,2]', '"text"', '42', 'null'])('returns 400 for non-object JSON %s', async (body) => {
      expect((await post(body)).status).toBe(400);
    });

    it('does not fail on wrong-typed fields', async () => {
      const cases: Array<[string, unknown]> = [
        ['order_status_update', { orderId: 5, status: { a: 1 } }],
        ['menu_update', { menus: 'nope' }],
        ['snooze_unsnooze', { operations: 'x' }],
        ['snooze_unsnooze', { operations: [null, 7, { action: 3, data: 'y' }, { action: 'snooze', data: { items: 5 } }] }],
        ['busy_mode', { status: ['PAUSED'] }],
      ];
      for (const [kind, payload] of cases) {
        const res = await post(JSON.stringify(payload), undefined, kind);
        expect(res.status).toBe(200);
      }
    });
  });
});
