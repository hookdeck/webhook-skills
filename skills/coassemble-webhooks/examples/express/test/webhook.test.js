const request = require('supertest');
const crypto = require('crypto');

// Coassemble webhook secrets are opaque strings; this one is only for tests
const SECRET = 'test_coassemble_secret_5f0c1a7e';
process.env.COASSEMBLE_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

const now = () => Math.floor(Date.now() / 1000);

// Matches Coassemble's scheme: "sha256=" + hex HMAC-SHA256 of "<timestamp>.<raw body>"
function sign(body, { timestamp = now(), secret = SECRET } = {}) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return { 'X-Coassemble-Signature': `sha256=${sig}`, 'X-Coassemble-Timestamp': String(timestamp) };
}


function event(type, data = {}, extra = {}) {
  return JSON.stringify({
    id: '17fd9df8-c77a-4b7d-a281-267b74f8cbf3',
    type,
    occurredAt: '2026-02-22T10:15:30.000Z',
    workspaceId: 1234,
    testMode: false,
    data: {
      course: { id: 4321, title: 'Security Basics', key: 'security-basics', clientIdentifier: 'course_abc' },
      tracking: { id: 8888, identifier: 'user_123', email: 'user@example.com', commenced: '2026-02-22T10:01:00.000Z', completed: '2026-02-22T10:15:30.000Z', totalTime: 870 },
      ...data,
    },
    ...extra,
  });
}

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/coassemble')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

describe('Coassemble webhook', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS;
    process.env.COASSEMBLE_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => jest.restoreAllMocks());

  describe('signature verification', () => {
    it('accepts a valid sha256= signature', async () => {
      const body = event('course.completed');
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts the bare digest without the sha256= prefix', async () => {
      const body = event('course.commenced');
      const h = sign(body);
      h['X-Coassemble-Signature'] = h['X-Coassemble-Signature'].slice('sha256='.length);
      expect((await post(body, h)).status).toBe(200);
    });

    it('accepts an uppercase hex digest', async () => {
      const body = event('course.completed');
      const h = sign(body);
      h['X-Coassemble-Signature'] = 'sha256=' + h['X-Coassemble-Signature'].slice(7).toUpperCase();
      expect((await post(body, h)).status).toBe(200);
    });

    it('verifies the exact raw bytes for any content type', async () => {
      // Non-canonical JSON (extra whitespace) must verify as sent, not as re-serialized
      const body = '{ "type" : "course.completed",\n  "data" : {} }';
      const res = await request(app)
        .post('/webhooks/coassemble')
        .set('Content-Type', 'text/plain')
        .set(sign(body))
        .send(body);
      expect(res.status).toBe(200);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const body = event('course.completed');
      expect((await post(body, sign(body, { secret: 'wrong_secret' }))).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = event('course.completed');
      expect((await post(event('course.commenced'), sign(body))).status).toBe(401);
    });

    it('rejects a tampered timestamp', async () => {
      const body = event('course.completed');
      const h = sign(body);
      h['X-Coassemble-Timestamp'] = String(now() + 1);
      expect((await post(body, h)).status).toBe(401);
    });

    it('rejects a missing or empty signature', async () => {
      const body = event('course.completed');
      const h = sign(body);
      expect((await post(body, { 'X-Coassemble-Timestamp': h['X-Coassemble-Timestamp'] })).status).toBe(401);
      expect((await post(body, { ...h, 'X-Coassemble-Signature': '' })).status).toBe(401);
    });

    it('rejects a missing or empty timestamp header', async () => {
      const body = event('course.completed');
      const h = sign(body);
      expect((await post(body, { 'X-Coassemble-Signature': h['X-Coassemble-Signature'] })).status).toBe(401);
      expect((await post(body, { ...h, 'X-Coassemble-Timestamp': '' })).status).toBe(401);
    });

    it('rejects malformed signatures', async () => {
      const body = event('course.completed');
      const { 'X-Coassemble-Timestamp': ts } = sign(body);
      const good = sign(body)['X-Coassemble-Signature'].slice(7);
      for (const bad of [
        'sha256=abc123',
        'sha256=' + 'zz'.repeat(32),
        'sha256=' + good + '00',
        'sha256=' + good.slice(0, 62) + '  ',
        'sha1=' + good,
        'not-a-signature',
      ]) {
        const res = await post(body, { 'X-Coassemble-Signature': bad, 'X-Coassemble-Timestamp': ts });
        expect(res.status).toBe(401);
      }
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.COASSEMBLE_WEBHOOK_SECRET;
      const body = event('course.completed');
      expect((await post(body, sign(body))).status).toBe(500);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const old = now() - 3600;

    it('does not reject old timestamps by default', async () => {
      const body = event('course.completed');
      expect((await post(body, sign(body, { timestamp: old }))).status).toBe(200);
    });

    it('rejects old timestamps when COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
      process.env.COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event('course.completed');
      expect((await post(body, sign(body, { timestamp: old }))).status).toBe(401);
      expect((await post(body, sign(body))).status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS = '0';
      const body = event('course.completed');
      expect((await post(body, sign(body, { timestamp: old }))).status).toBe(200);
    });
  });

  describe('event handling', () => {
    const events = [
      'course.created',
      'course.commenced',
      'course.completed',
      'quiz.completed',
      'quiz.failed',
      'migration.progress',
      'migration.completed',
    ];

    it.each(events)('handles %s', async (name) => {
      const body = event(name);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled event'));
    });

    it('acknowledges testMode events without taking action', async () => {
      const body = event('course.completed', {}, { testMode: true });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Test event course.completed acknowledged (no action taken)');
    });

    it('logs unknown events and still returns 200', async () => {
      const body = event('course.something.else');
      expect((await post(body, sign(body))).status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Unhandled event: course.something.else');
    });

    it('returns 400 for a validly signed non-JSON body', async () => {
      const body = 'not json';
      expect((await post(body, sign(body))).status).toBe(400);
    });
  });
});
