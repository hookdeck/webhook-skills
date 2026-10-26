// Generated with: podium-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// The secret is whatever you set when you created the webhook; it is the HMAC key as UTF-8 bytes.
const SECRET = 'podium_test_secret_0123456789abcdef';
process.env.PODIUM_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** Sign exactly like Podium: HMAC-SHA256(secret, `${podium-timestamp}.${rawBody}`) as hex. */
function sign(rawBody, timestamp, secret = SECRET) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  return crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(String(timestamp), 'latin1'), Buffer.from('.'), body]))
    .digest('hex');
}

// podium-timestamp is Unix milliseconds (e.g. 1620936594591).
const now = () => Date.now();

// Podium delivers { data, metadata: { event_type, version } }.
const payloadFor = (event) =>
  JSON.stringify({ data: { uid: 'abc-123', body: 'Hello' }, metadata: { event_type: event, version: '2021.04.01' } });

function post(rawBody, { timestamp = now(), signature, secret, method = 'post' } = {}) {
  const ts = String(timestamp);
  const req = request(app)[method]('/webhooks/podium').set('Content-Type', 'application/json');
  if (timestamp !== null) req.set('podium-timestamp', ts);
  const sig = signature === undefined ? sign(rawBody, ts, secret) : signature;
  if (sig !== null) req.set('podium-signature', sig);
  return req.send(rawBody);
}

describe('Podium webhook', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.PODIUM_WEBHOOK_SECRET = SECRET;
    delete process.env.PODIUM_WEBHOOK_TOLERANCE_SECONDS;
  });
  afterEach(() => jest.restoreAllMocks());

  describe('valid deliveries', () => {
    it.each([
      'message.received',
      'message.sent',
      'contact.created',
      'contact.updated',
      'review.created',
      'invoice.payment_succeeded',
      'call.completed',
    ])(
      'accepts a signed %s event',
      async (event) => {
        const res = await post(payloadFor(event));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ received: true });
        expect(logSpy).toHaveBeenCalled();
      }
    );

    it('dispatches on metadata.event_type', async () => {
      const res = await post(payloadFor('contact.updated'));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Contact updated', expect.anything());
    });

    it('accepts a body with no metadata with 200', async () => {
      const res = await post(JSON.stringify({ data: {} }));
      expect(res.status).toBe(200);
    });

    it('accepts unknown events with 200', async () => {
      const res = await post(payloadFor('something_else'));
      expect(res.status).toBe(200);
    });

    it.each(['put', 'patch', 'delete'])('verifies %s deliveries', async (method) => {
      const res = await post(payloadFor('message.received'), { method });
      expect(res.status).toBe(200);
    });

    it('verifies a GET with no body (empty bytes)', async () => {
      const ts = String(now());
      const res = await request(app)
        .get('/webhooks/podium')
        .set('podium-timestamp', ts)
        .set('podium-signature', sign('', ts));
      expect(res.status).toBe(200);
    });

    it('rejects an unsigned GET', async () => {
      const res = await request(app).get('/webhooks/podium');
      expect(res.status).toBe(401);
    });

    it('verifies the raw bytes for any content type (400 when not JSON)', async () => {
      const raw = 'not json at all';
      const ts = String(now());
      const res = await request(app)
        .post('/webhooks/podium')
        .set('Content-Type', 'text/plain')
        .set('podium-timestamp', ts)
        .set('podium-signature', sign(raw, ts))
        .send(raw);
      // Signature is valid; the body just isn't JSON.
      expect(res.status).toBe(400);
    });

    it('signs the raw bytes, not re-serialised JSON', async () => {
      // Pretty-printed, odd key order and non-ASCII: JSON.stringify(JSON.parse(x)) differs.
      const raw = '{\n  "metadata": { "version": "2021.04.01",  "event_type": "message.received" },\n  "data": { "z": 1, "a": "café ☃" }\n}';
      expect(JSON.stringify(JSON.parse(raw))).not.toBe(raw);
      const res = await post(raw);
      expect(res.status).toBe(200);
    });

    it('accepts an uppercase hex digest', async () => {
      const raw = payloadFor('message.received');
      const ts = String(now());
      const res = await post(raw, { timestamp: ts, signature: sign(raw, ts).toUpperCase() });
      expect(res.status).toBe(200);
    });

    it('does not reject old timestamps by default (retries and replays)', async () => {
      const res = await post(payloadFor('message.received'), { timestamp: now() - 24 * 3600 * 1000 });
      expect(res.status).toBe(200);
    });
  });

  describe('invalid deliveries', () => {
    it('rejects a tampered body', async () => {
      const ts = String(now());
      const sig = sign(payloadFor('message.received'), ts);
      const res = await post(payloadFor('contact.updated'), { timestamp: ts, signature: sig });
      expect(res.status).toBe(401);
    });

    it('rejects a different timestamp than the one signed', async () => {
      const raw = payloadFor('message.received');
      const sig = sign(raw, 1000);
      const res = await post(raw, { timestamp: 1001, signature: sig });
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const res = await post(payloadFor('message.received'), { secret: 'other_secret' });
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
      expect((await post(raw, { timestamp: ts, signature: decoded })).status).toBe(401);
      expect((await post(raw, { timestamp: ts, secret: hexSecret })).status).toBe(200);
    });

    it('rejects a missing signature header', async () => {
      const res = await post(payloadFor('message.received'), { signature: null });
      expect(res.status).toBe(401);
    });

    it('rejects a missing timestamp header', async () => {
      const raw = payloadFor('message.received');
      const res = await post(raw, { timestamp: null, signature: sign(raw, now()) });
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature header', async () => {
      const res = await post(payloadFor('message.received'), { signature: '' });
      expect(res.status).toBe(401);
    });

    it.each([
      ['too short', 'abcd'],
      ['too long', 'a'.repeat(66)],
      ['non-hex characters', 'z'.repeat(64)],
      ['prefixed', 'sha256=' + 'a'.repeat(64)],
    ])('rejects a malformed signature (%s)', async (_name, signature) => {
      const res = await post(payloadFor('message.received'), { signature });
      expect(res.status).toBe(401);
    });

    it('returns 400 for a verified body that is not JSON', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(400);
    });

    it('fails closed with 500 when the secret is not configured', async () => {
      delete process.env.PODIUM_WEBHOOK_SECRET;
      const res = await post(payloadFor('message.received'));
      expect(res.status).toBe(500);
    });
  });

  describe('opt-in timestamp tolerance', () => {
    it('rejects an old timestamp when a tolerance is set', async () => {
      process.env.PODIUM_WEBHOOK_TOLERANCE_SECONDS = '300';
      const res = await post(payloadFor('message.received'), { timestamp: now() - 3600 * 1000 });
      expect(res.status).toBe(401);
    });

    it('accepts a fresh timestamp when a tolerance is set', async () => {
      process.env.PODIUM_WEBHOOK_TOLERANCE_SECONDS = '300';
      const res = await post(payloadFor('message.received'));
      expect(res.status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.PODIUM_WEBHOOK_TOLERANCE_SECONDS = '0';
      const res = await post(payloadFor('message.received'), { timestamp: now() - 3600 * 1000 });
      expect(res.status).toBe(200);
    });
  });
});
