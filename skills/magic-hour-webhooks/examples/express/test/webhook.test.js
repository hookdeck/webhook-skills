const crypto = require('crypto');
const request = require('supertest');

// Magic Hour secrets look like whsec_...; the whole string is the HMAC key
const SECRET = 'whsec_test_secret_0123456789abcdef';
process.env.MAGIC_HOUR_WEBHOOK_SECRET = SECRET;
delete process.env.MAGIC_HOUR_WEBHOOK_TOLERANCE_SECONDS;

const app = require('../src/index');
const { verifyMagicHourSignature } = require('../src/index');

// Sign exactly as Magic Hour does: hex HMAC-SHA256 over `${timestamp}.${raw body}`
function sign(body, timestamp, secret = SECRET) {
  const message = Buffer.concat([Buffer.from(String(timestamp), 'latin1'), Buffer.from('.'), Buffer.from(body)]);
  return crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest('hex');
}

function samplePayload(type = 'video.completed') {
  return {
    type,
    payload: {
      id: 'clx7uu86w0a5qp55yxz315r6r',
      status: type.endsWith('errored') ? 'error' : 'complete',
      credits_charged: 450,
      downloads: type.endsWith('completed')
        ? [{ url: 'https://videos.magichour.ai/clx7uu86w0a5qp55yxz315r6r/output.mp4', expires_at: '2024-10-19T05:16:19.027Z' }]
        : [],
      error: type.endsWith('errored') ? { code: 'invalid_video_file', message: 'bad file' } : null,
    },
  };
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function post(body, headers, contentType = 'application/json') {
  const req = request(app).post('/webhooks/magic-hour').set('Content-Type', contentType);
  Object.entries(headers).forEach(([k, v]) => req.set(k, v));
  return req.send(body);
}

function signedPost(payload = samplePayload(), timestamp = nowSeconds()) {
  const body = JSON.stringify(payload);
  return post(body, {
    'magic-hour-event-signature': sign(body, timestamp),
    'magic-hour-event-timestamp': String(timestamp),
  });
}

describe('Magic Hour webhook endpoint', () => {
  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const res = await signedPost();
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts uppercase hex (hex is case-insensitive)', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = nowSeconds();
      const res = await post(body, {
        'magic-hour-event-signature': sign(body, ts).toUpperCase(),
        'magic-hour-event-timestamp': String(ts),
      });
      expect(res.status).toBe(200);
    });

    it('accepts any content type (raw body)', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = nowSeconds();
      const res = await post(
        body,
        { 'magic-hour-event-signature': sign(body, ts), 'magic-hour-event-timestamp': String(ts) },
        'text/plain'
      );
      expect(res.status).toBe(200);
    });

    it('verifies the exact raw bytes, not re-serialised JSON', async () => {
      const body = '{ "type" : "video.completed",\n  "payload": {"id": "x"} }';
      const ts = nowSeconds();
      const res = await post(body, {
        'magic-hour-event-signature': sign(body, ts),
        'magic-hour-event-timestamp': String(ts),
      });
      expect(res.status).toBe(200);
    });

    it('accepts an old timestamp by default (retries resend it)', async () => {
      const res = await signedPost(samplePayload(), nowSeconds() - 3600);
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature header', async () => {
      const res = await post(JSON.stringify(samplePayload()), {
        'magic-hour-event-timestamp': String(nowSeconds()),
      });
      expect(res.status).toBe(401);
    });

    it('rejects a missing timestamp header', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await post(body, { 'magic-hour-event-signature': sign(body, nowSeconds()) });
      expect(res.status).toBe(401);
    });

    it('rejects a mismatched signature', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = nowSeconds();
      const res = await post(body, {
        'magic-hour-event-signature': 'a'.repeat(64),
        'magic-hour-event-timestamp': String(ts),
      });
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = nowSeconds();
      const res = await post(body, {
        'magic-hour-event-signature': sign(body, ts, 'whsec_other_secret'),
        'magic-hour-event-timestamp': String(ts),
      });
      expect(res.status).toBe(401);
    });

    it('rejects a signature made without the whsec_ prefix', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = nowSeconds();
      const res = await post(body, {
        'magic-hour-event-signature': sign(body, ts, SECRET.replace('whsec_', '')),
        'magic-hour-event-timestamp': String(ts),
      });
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = nowSeconds();
      const res = await post(body.replace('450', '1'), {
        'magic-hour-event-signature': sign(body, ts),
        'magic-hour-event-timestamp': String(ts),
      });
      expect(res.status).toBe(401);
    });

    it('rejects a tampered timestamp', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await post(body, {
        'magic-hour-event-signature': sign(body, 1729314984),
        'magic-hour-event-timestamp': '1729314985',
      });
      expect(res.status).toBe(401);
    });

    it.each([
      ['too short', 'abcdef'],
      ['too long', 'a'.repeat(65)],
      ['non-hex characters', 'z'.repeat(64)],
      ['sha256= prefix', 'sha256=' + 'a'.repeat(64)],
    ])('rejects a malformed signature (%s)', async (_name, signature) => {
      const res = await post(JSON.stringify(samplePayload()), {
        'magic-hour-event-signature': signature,
        'magic-hour-event-timestamp': String(nowSeconds()),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each([
      'video.started',
      'video.completed',
      'video.errored',
      'image.started',
      'image.completed',
      'image.errored',
      'audio.started',
      'audio.completed',
      'audio.errored',
    ])('handles %s', async (type) => {
      const res = await signedPost(samplePayload(type));
      expect(res.status).toBe(200);
    });

    it('logs unknown event types and returns 200', async () => {
      const res = await signedPost({ type: 'video.canceled', payload: { id: 'x' } });
      expect(res.status).toBe(200);
    });

    it('returns 400 for a signed body that is not JSON', async () => {
      const body = 'not json';
      const ts = nowSeconds();
      const res = await post(body, {
        'magic-hour-event-signature': sign(body, ts),
        'magic-hour-event-timestamp': String(ts),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('verifyMagicHourSignature()', () => {
    const body = Buffer.from(JSON.stringify(samplePayload()));

    function headersFor(timestamp) {
      return {
        'magic-hour-event-signature': sign(body, timestamp),
        'magic-hour-event-timestamp': String(timestamp),
      };
    }

    it('is valid with the right secret', () => {
      expect(verifyMagicHourSignature(body, headersFor(nowSeconds()), { secret: SECRET }).valid).toBe(true);
    });

    it('is invalid when no secret is configured', () => {
      expect(verifyMagicHourSignature(body, headersFor(nowSeconds()), { secret: '' }).valid).toBe(false);
    });

    it('rejects an old timestamp only when a tolerance is set', () => {
      const old = headersFor(nowSeconds() - 3600);
      expect(verifyMagicHourSignature(body, old, { secret: SECRET, toleranceSeconds: 0 }).valid).toBe(true);
      expect(verifyMagicHourSignature(body, old, { secret: SECRET, toleranceSeconds: 300 }).valid).toBe(false);
    });

    it('rejects a far-future timestamp when a tolerance is set', () => {
      const future = headersFor(nowSeconds() + 3600);
      expect(verifyMagicHourSignature(body, future, { secret: SECRET, toleranceSeconds: 300 }).valid).toBe(false);
    });

    it('accepts a fresh timestamp within the tolerance', () => {
      const fresh = headersFor(nowSeconds() - 30);
      expect(verifyMagicHourSignature(body, fresh, { secret: SECRET, toleranceSeconds: 300 }).valid).toBe(true);
    });

    it('rejects a non-numeric timestamp when a tolerance is set', () => {
      const headers = headersFor('not-a-number');
      expect(verifyMagicHourSignature(body, headers, { secret: SECRET, toleranceSeconds: 300 }).valid).toBe(false);
      expect(verifyMagicHourSignature(body, headers, { secret: SECRET }).valid).toBe(true);
    });
  });
});
