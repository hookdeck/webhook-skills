import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// High Mobility secrets are plain strings used as UTF-8 bytes; this one is only for tests
const SECRET = 'test_secret_for_high_mobility';

type Handler = (request: NextRequest) => Promise<Response>;
let handlers: Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', Handler>;

beforeAll(async () => {
  process.env.HIGH_MOBILITY_WEBHOOK_SECRET = SECRET;
  handlers = await import('../app/webhooks/high-mobility/route');
});

beforeEach(() => {
  process.env.HIGH_MOBILITY_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const digest = (body: string | Buffer, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('hex');
const sign = (body: string | Buffer, secret = SECRET) => `sha256=${digest(body, secret)}`;

// Payload as shown in High Mobility's docs
const clearance = {
  vehicle: { vin: '1HMCF6112HA3FBBCC' },
  event: {
    type: 'fleet_clearance_changed',
    action: 'rejected',
    detail: 'invalid VIN',
    received_at: '2025-06-19T09:49:08.386159Z',
  },
  application: { id: 'A77294AC8DA324FB46DA98921' },
};
const ping = {
  vehicle: { vin: '*' },
  event: { type: 'ping', received_at: '2025-06-19T09:49:08.386159Z' },
  application: { id: 'A77294AC8DA324FB46DA98921' },
};

function send(
  method: keyof typeof handlers,
  body?: string | Buffer,
  signature?: string,
  contentType = 'application/json'
) {
  const headers: Record<string, string> = {};
  if (signature !== undefined) headers['x-hm-signature-256'] = signature;
  if (body !== undefined) headers['content-type'] = contentType;
  return handlers[method](
    new NextRequest('http://localhost:3000/webhooks/high-mobility', {
      method,
      headers,
      ...(body !== undefined ? { body: new Uint8Array(Buffer.from(body)) } : {}),
    })
  );
}

describe('High Mobility webhook', () => {
  describe('signature verification', () => {
    const body = JSON.stringify(clearance);

    it('accepts sha256=<hex>', async () => {
      const res = await send('POST', body, sign(body));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the bare digest and uppercase hex', async () => {
      expect((await send('POST', body, digest(body))).status).toBe(200);
      expect((await send('POST', body, `sha256=${digest(body).toUpperCase()}`)).status).toBe(200);
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)('verifies %s requests', async (method) => {
      expect((await send(method, body, sign(body))).status).toBe(200);
      expect((await send(method, body, sign(body, 'wrong'))).status).toBe(401);
    });

    it('verifies a GET with no body over zero bytes and acknowledges it', async () => {
      const res = await send('GET', undefined, sign(''));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect((await send('GET', undefined, sign('x'))).status).toBe(401);
      expect((await send('GET')).status).toBe(401);
    });

    it('verifies exact bytes for any content type', async () => {
      const text = JSON.stringify(clearance, null, 4); // formatting must not matter
      expect((await send('POST', text, sign(text), 'text/plain')).status).toBe(200);
    });

    it('verifies raw bytes that are not valid UTF-8 (then rejects the JSON)', async () => {
      const bytes = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
      const res = await send('POST', bytes, sign(bytes), 'application/octet-stream');
      expect(res.status).toBe(400);
    });

    it('rejects a missing, empty or malformed signature', async () => {
      expect((await send('POST', body)).status).toBe(401);
      expect((await send('POST', body, '')).status).toBe(401);
      expect((await send('POST', body, 'sha256=')).status).toBe(401);
      expect((await send('POST', body, 'sha256=abc123')).status).toBe(401);
      expect((await send('POST', body, `sha256=${'z'.repeat(64)}`)).status).toBe(401);
      expect((await send('POST', body, `sha256=${digest(body)}00`)).status).toBe(401);
      expect((await send('POST', body, `sha1=${digest(body)}`)).status).toBe(401);
    });

    it('rejects a wrong secret and a tampered body', async () => {
      expect((await send('POST', body, sign(body, 'wrong_secret'))).status).toBe(401);
      expect((await send('POST', body + ' ', sign(body))).status).toBe(401);
    });

    it('ignores the deprecated X-HM-Signature header', async () => {
      const sha1 = crypto.createHmac('sha1', SECRET).update(body).digest('hex');
      const res = await handlers.POST(
        new NextRequest('http://localhost:3000/webhooks/high-mobility', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-hm-signature': sha1 },
          body,
        })
      );
      expect(res.status).toBe(401);
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.HIGH_MOBILITY_WEBHOOK_SECRET;
      expect((await send('POST', body, sign(body))).status).toBe(500);
    });
  });

  describe('event handling', () => {
    const post = (payload: unknown) => {
      const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
      return send('POST', body, sign(body));
    };

    it('handles fleet_clearance_changed', async () => {
      expect((await post(clearance)).status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(
        'Fleet clearance changed for 1HMCF6112HA3FBBCC: rejected invalid VIN'
      );
    });

    it('handles ping', async () => {
      expect((await post(ping)).status).toBe(200);
    });

    it('acknowledges unknown event types', async () => {
      expect((await post({ event: { type: 'something_else' } })).status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Unhandled event: something_else');
    });

    it('returns 400 for signed invalid JSON or a non-object body', async () => {
      for (const bad of ['not json', '[]', '"text"', 'null', '42']) {
        expect((await post(bad)).status).toBe(400);
      }
    });

    it('ignores wrong-typed fields instead of failing', async () => {
      for (const payload of [
        { event: 'fleet_clearance_changed' },
        { event: ['x'], vehicle: 'vin' },
        { event: { type: 5, action: {}, detail: [] }, vehicle: { vin: 7 } },
        { event: { type: 'fleet_clearance_changed' }, vehicle: null },
        {},
      ]) {
        expect((await post(payload)).status).toBe(200);
      }
    });
  });
});
