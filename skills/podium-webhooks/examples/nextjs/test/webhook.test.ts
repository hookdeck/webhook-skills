// Generated with: podium-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/podium/route';

// The secret is whatever you set when you created the webhook; it is the HMAC key as UTF-8 bytes.
const SECRET = 'podium_test_secret_0123456789abcdef';

/** Sign exactly like Podium: HMAC-SHA256(secret, `${podium-timestamp}.${rawBody}`) as hex. */
function sign(rawBody: string | Buffer, timestamp: string | number, secret = SECRET): string {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  return crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(String(timestamp), 'latin1'), Buffer.from('.'), body]))
    .digest('hex');
}

// podium-timestamp is Unix milliseconds (e.g. 1620936594591).
const now = () => Date.now();

// Podium delivers { data, metadata: { event_type, version } }.
const payloadFor = (event: string) =>
  JSON.stringify({ data: { uid: 'abc-123', body: 'Hello' }, metadata: { event_type: event, version: '2021.04.01' } });

interface Options {
  timestamp?: number | string | null;
  signature?: string | null;
  secret?: string;
  handler?: (req: Request) => Promise<Response>;
  method?: string;
}

function send(rawBody: string | Buffer | null, opts: Options = {}) {
  const { timestamp = now(), signature, secret, handler = POST, method = 'POST' } = opts;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (timestamp !== null) headers['podium-timestamp'] = String(timestamp);
  const sig =
    signature === undefined ? sign(rawBody ?? '', String(timestamp), secret) : signature;
  if (sig !== null) headers['podium-signature'] = sig;
  const init: RequestInit = { method, headers };
  if (rawBody !== null) init.body = rawBody as BodyInit;
  return handler(new Request('http://localhost/webhooks/podium', init));
}

describe('Podium webhook route', () => {
  beforeEach(() => {
    process.env.PODIUM_WEBHOOK_SECRET = SECRET;
    delete process.env.PODIUM_WEBHOOK_TOLERANCE_SECONDS;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  describe('valid deliveries', () => {
    it.each(
      ['message.received', 'message.sent', 'contact.created', 'contact.updated', 'review.created', 'invoice.payment_succeeded', 'call.completed']
    )(
      'accepts a signed %s event',
      async (event) => {
        const res = await send(payloadFor(event));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ received: true });
      }
    );

    it('dispatches on metadata.event_type', async () => {
      const res = await send(payloadFor('contact.updated'));
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Contact updated', expect.anything());
    });

    it('accepts a body with no metadata with 200', async () => {
      expect((await send(JSON.stringify({ data: {} }))).status).toBe(200);
    });

    it('accepts unknown events with 200', async () => {
      expect((await send(payloadFor('something_else'))).status).toBe(200);
    });

    it.each([
      ['PUT', PUT],
      ['PATCH', PATCH],
      ['DELETE', DELETE],
    ])('verifies %s deliveries', async (method, handler) => {
      const res = await send(payloadFor('message.received'), { handler, method });
      expect(res.status).toBe(200);
    });

    it('verifies a GET with no body (empty bytes)', async () => {
      const res = await send(null, { handler: GET, method: 'GET' });
      expect(res.status).toBe(200);
    });

    it('rejects an unsigned GET', async () => {
      const res = await GET(new Request('http://localhost/webhooks/podium'));
      expect(res.status).toBe(401);
    });

    it('verifies the raw bytes for any content type (400 when not JSON)', async () => {
      const raw = 'not json at all';
      const ts = String(now());
      const res = await POST(
        new Request('http://localhost/webhooks/podium', {
          method: 'POST',
          headers: {
            'content-type': 'text/plain',
            'podium-timestamp': ts,
            'podium-signature': sign(raw, ts),
          },
          body: raw,
        })
      );
      expect(res.status).toBe(400);
    });

    it('signs the raw bytes, not re-serialised JSON', async () => {
      // Pretty-printed, odd key order and non-ASCII: JSON.stringify(JSON.parse(x)) differs.
      const raw = '{\n  "metadata": { "version": "2021.04.01",  "event_type": "message.received" },\n  "data": { "z": 1, "a": "café ☃" }\n}';
      expect(JSON.stringify(JSON.parse(raw))).not.toBe(raw);
      expect((await send(Buffer.from(raw, 'utf8'))).status).toBe(200);
    });

    it('accepts an uppercase hex digest', async () => {
      const raw = payloadFor('message.received');
      const ts = String(now());
      const res = await send(raw, { timestamp: ts, signature: sign(raw, ts).toUpperCase() });
      expect(res.status).toBe(200);
    });

    it('does not reject old timestamps by default (retries and replays)', async () => {
      const res = await send(payloadFor('message.received'), { timestamp: now() - 24 * 3600 * 1000 });
      expect(res.status).toBe(200);
    });
  });

  describe('invalid deliveries', () => {
    it('rejects a tampered body', async () => {
      const ts = String(now());
      const sig = sign(payloadFor('message.received'), ts);
      const res = await send(payloadFor('contact.updated'), { timestamp: ts, signature: sig });
      expect(res.status).toBe(401);
    });

    it('rejects a different timestamp than the one signed', async () => {
      const raw = payloadFor('message.received');
      const res = await send(raw, { timestamp: 1001, signature: sign(raw, 1000) });
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const res = await send(payloadFor('message.received'), { secret: 'other_secret' });
      expect(res.status).toBe(401);
    });

    it('uses the secret as UTF-8 text, not hex-decoded', async () => {
      const hexSecret = 'deadbeef'.repeat(8);
      process.env.PODIUM_WEBHOOK_SECRET = hexSecret;
      const raw = payloadFor('message.received');
      const ts = String(now());
      const decoded = crypto
        .createHmac('sha256', Buffer.from(hexSecret, 'hex'))
        .update(Buffer.concat([Buffer.from(ts, 'latin1'), Buffer.from('.'), Buffer.from(raw)]))
        .digest('hex');
      expect((await send(raw, { timestamp: ts, signature: decoded })).status).toBe(401);
      expect((await send(raw, { timestamp: ts, secret: hexSecret })).status).toBe(200);
    });

    it('rejects a missing signature header', async () => {
      expect((await send(payloadFor('message.received'), { signature: null })).status).toBe(401);
    });

    it('rejects a missing timestamp header', async () => {
      const raw = payloadFor('message.received');
      const res = await send(raw, { timestamp: null, signature: sign(raw, now()) });
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature header', async () => {
      expect((await send(payloadFor('message.received'), { signature: '' })).status).toBe(401);
    });

    it.each([
      ['too short', 'abcd'],
      ['too long', 'a'.repeat(66)],
      ['non-hex characters', 'z'.repeat(64)],
      ['prefixed', 'sha256=' + 'a'.repeat(64)],
    ])('rejects a malformed signature (%s)', async (_name, signature) => {
      expect((await send(payloadFor('message.received'), { signature })).status).toBe(401);
    });

    it('returns 400 for a verified body that is not JSON', async () => {
      expect((await send('{not json')).status).toBe(400);
    });

    it('fails closed with 500 when the secret is not configured', async () => {
      delete process.env.PODIUM_WEBHOOK_SECRET;
      expect((await send(payloadFor('message.received'))).status).toBe(500);
    });
  });

  describe('opt-in timestamp tolerance', () => {
    it('rejects an old timestamp when a tolerance is set', async () => {
      process.env.PODIUM_WEBHOOK_TOLERANCE_SECONDS = '300';
      const res = await send(payloadFor('message.received'), { timestamp: now() - 3600 * 1000 });
      expect(res.status).toBe(401);
    });

    it('accepts a fresh timestamp when a tolerance is set', async () => {
      process.env.PODIUM_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await send(payloadFor('message.received'))).status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.PODIUM_WEBHOOK_TOLERANCE_SECONDS = '0';
      const res = await send(payloadFor('message.received'), { timestamp: now() - 3600 * 1000 });
      expect(res.status).toBe(200);
    });
  });
});
