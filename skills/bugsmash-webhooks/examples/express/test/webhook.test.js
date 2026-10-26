// Generated with: bugsmash-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// BugSmash secret_key values look like "bgsmsh_..." and are used whole as the HMAC key.
const SECRET = 'bgsmsh_test_secret_key_0123456789abcdef';
process.env.BUGSMASH_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** Sign exactly like BugSmash: HMAC-SHA256(secret, `${timestamp}.${rawBody}`) as hex. */
function sign(rawBody, timestamp, secret = SECRET) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  return crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(String(timestamp), 'latin1'), Buffer.from('.'), body]))
    .digest('hex');
}

const now = () => Math.floor(Date.now() / 1000);

// Illustrative payload: BugSmash documents no delivery body.
const payloadFor = (event) => JSON.stringify({ event, data: { comment: 'Logo is cut off' } });

function post(rawBody, { timestamp = now(), signature, secret, method = 'post' } = {}) {
  const ts = String(timestamp);
  const req = request(app)[method]('/webhooks/bugsmash').set('Content-Type', 'application/json');
  if (timestamp !== null) req.set('X-Webhook-Timestamp', ts);
  const sig = signature === undefined ? sign(rawBody, ts, secret) : signature;
  if (sig !== null) req.set('X-BugSmash-Signature', sig);
  return req.send(rawBody);
}

describe('BugSmash webhook', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.BUGSMASH_WEBHOOK_SECRET = SECRET;
    delete process.env.BUGSMASH_WEBHOOK_TOLERANCE_SECONDS;
  });
  afterEach(() => jest.restoreAllMocks());

  describe('valid deliveries', () => {
    it.each(['new_comment', 'comment_replied', 'status_changed', 'comment_updated'])(
      'accepts a signed %s event',
      async (event) => {
        const res = await post(payloadFor(event));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ received: true });
        expect(logSpy).toHaveBeenCalled();
      }
    );

    it('reads the event name from `type` when `event` is absent', async () => {
      const res = await post(JSON.stringify({ type: 'status_changed' }));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Status changed', expect.anything());
    });

    it('accepts unknown events with 200', async () => {
      const res = await post(payloadFor('something_else'));
      expect(res.status).toBe(200);
    });

    it.each(['put', 'patch', 'delete'])('verifies %s deliveries', async (method) => {
      const res = await post(payloadFor('new_comment'), { method });
      expect(res.status).toBe(200);
    });

    it('verifies a GET with no body (empty bytes)', async () => {
      const ts = String(now());
      const res = await request(app)
        .get('/webhooks/bugsmash')
        .set('X-Webhook-Timestamp', ts)
        .set('X-BugSmash-Signature', sign('', ts));
      expect(res.status).toBe(200);
    });

    it('rejects an unsigned GET', async () => {
      const res = await request(app).get('/webhooks/bugsmash');
      expect(res.status).toBe(401);
    });

    it('verifies the raw bytes for any content type (400 when not JSON)', async () => {
      const raw = 'not json at all';
      const ts = String(now());
      const res = await request(app)
        .post('/webhooks/bugsmash')
        .set('Content-Type', 'text/plain')
        .set('X-Webhook-Timestamp', ts)
        .set('X-BugSmash-Signature', sign(raw, ts))
        .send(raw);
      // Signature is valid; the body just isn't JSON.
      expect(res.status).toBe(400);
    });

    it('signs the raw bytes, not re-serialised JSON', async () => {
      // Pretty-printed, odd key order and non-ASCII: JSON.stringify(JSON.parse(x)) differs.
      const raw = '{\n  "event":  "new_comment",\n  "data": { "z": 1, "a": "café ☃" }\n}';
      expect(JSON.stringify(JSON.parse(raw))).not.toBe(raw);
      const res = await post(raw);
      expect(res.status).toBe(200);
    });

    it('accepts an uppercase hex digest', async () => {
      const raw = payloadFor('new_comment');
      const ts = String(now());
      const res = await post(raw, { timestamp: ts, signature: sign(raw, ts).toUpperCase() });
      expect(res.status).toBe(200);
    });

    it('does not reject old timestamps by default (retries and replays)', async () => {
      const res = await post(payloadFor('new_comment'), { timestamp: now() - 24 * 3600 });
      expect(res.status).toBe(200);
    });
  });

  describe('invalid deliveries', () => {
    it('rejects a tampered body', async () => {
      const ts = String(now());
      const sig = sign(payloadFor('new_comment'), ts);
      const res = await post(payloadFor('status_changed'), { timestamp: ts, signature: sig });
      expect(res.status).toBe(401);
    });

    it('rejects a different timestamp than the one signed', async () => {
      const raw = payloadFor('new_comment');
      const sig = sign(raw, 1000);
      const res = await post(raw, { timestamp: 1001, signature: sig });
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const res = await post(payloadFor('new_comment'), { secret: 'bgsmsh_other_secret' });
      expect(res.status).toBe(401);
    });

    it('requires the bgsmsh_ prefix as part of the key', async () => {
      const res = await post(payloadFor('new_comment'), { secret: SECRET.replace('bgsmsh_', '') });
      expect(res.status).toBe(401);
    });

    it('rejects a missing signature header', async () => {
      const res = await post(payloadFor('new_comment'), { signature: null });
      expect(res.status).toBe(401);
    });

    it('rejects a missing timestamp header', async () => {
      const raw = payloadFor('new_comment');
      const res = await post(raw, { timestamp: null, signature: sign(raw, now()) });
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature header', async () => {
      const res = await post(payloadFor('new_comment'), { signature: '' });
      expect(res.status).toBe(401);
    });

    it.each([
      ['too short', 'abcd'],
      ['too long', 'a'.repeat(66)],
      ['non-hex characters', 'z'.repeat(64)],
      ['prefixed', 'sha256=' + 'a'.repeat(64)],
    ])('rejects a malformed signature (%s)', async (_name, signature) => {
      const res = await post(payloadFor('new_comment'), { signature });
      expect(res.status).toBe(401);
    });

    it('returns 400 for a verified body that is not JSON', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(400);
    });

    it('fails closed with 500 when the secret is not configured', async () => {
      delete process.env.BUGSMASH_WEBHOOK_SECRET;
      const res = await post(payloadFor('new_comment'));
      expect(res.status).toBe(500);
    });
  });

  describe('opt-in timestamp tolerance', () => {
    it('rejects an old timestamp when a tolerance is set', async () => {
      process.env.BUGSMASH_WEBHOOK_TOLERANCE_SECONDS = '300';
      const res = await post(payloadFor('new_comment'), { timestamp: now() - 3600 });
      expect(res.status).toBe(401);
    });

    it('accepts a fresh timestamp when a tolerance is set', async () => {
      process.env.BUGSMASH_WEBHOOK_TOLERANCE_SECONDS = '300';
      const res = await post(payloadFor('new_comment'));
      expect(res.status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.BUGSMASH_WEBHOOK_TOLERANCE_SECONDS = '0';
      const res = await post(payloadFor('new_comment'), { timestamp: now() - 3600 });
      expect(res.status).toBe(200);
    });
  });
});
