const request = require('supertest');
const crypto = require('crypto');

// Chatim webhook secrets are opaque strings; this one is only for tests
const SECRET = 'test_chatim_secret_5f0c1a7e';
process.env.CHATIM_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

const now = () => Math.floor(Date.now() / 1000);

// Matches Chatim's scheme: "sha256=" + hex HMAC-SHA256 of "<timestamp>.<raw body>"
function sign(body, { timestamp = now(), secret = SECRET } = {}) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return { 'X-Chatim-Signature': `sha256=${sig}`, 'X-Chatim-Timestamp': String(timestamp) };
}

function event(name, data = {}) {
  return JSON.stringify({
    event: name,
    eventId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    timestamp: '2025-01-15T10:30:00.000Z',
    projectUuid: 'project-uuid',
    chatUuid: 'chat-uuid',
    data: { visitor: { uuid: 'visitor-uuid', name: 'John Doe' }, ...data },
  });
}

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/chatim')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

describe('Chatim webhook', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.CHATIM_WEBHOOK_TOLERANCE_SECONDS;
    process.env.CHATIM_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => jest.restoreAllMocks());

  describe('signature verification', () => {
    it('accepts a valid sha256= signature', async () => {
      const body = event('chat.started', { page: { url: 'https://example.com' } });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts the bare digest without the sha256= prefix', async () => {
      const body = event('chat.closed', { closedBy: 'agent', duration: 5 });
      const h = sign(body);
      h['X-Chatim-Signature'] = h['X-Chatim-Signature'].slice('sha256='.length);
      expect((await post(body, h)).status).toBe(200);
    });

    it('accepts an uppercase hex digest', async () => {
      const body = event('chat.started');
      const h = sign(body);
      h['X-Chatim-Signature'] = 'sha256=' + h['X-Chatim-Signature'].slice(7).toUpperCase();
      expect((await post(body, h)).status).toBe(200);
    });

    it('verifies the exact raw bytes for any content type', async () => {
      // Non-canonical JSON (extra whitespace) must verify as sent, not as re-serialized
      const body = '{ "event" : "chat.started",\n  "data" : {} }';
      const res = await request(app)
        .post('/webhooks/chatim')
        .set('Content-Type', 'text/plain')
        .set(sign(body))
        .send(body);
      expect(res.status).toBe(200);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const body = event('chat.started');
      expect((await post(body, sign(body, { secret: 'wrong_secret' }))).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = event('chat.started');
      expect((await post(event('chat.closed'), sign(body))).status).toBe(401);
    });

    it('rejects a tampered timestamp', async () => {
      const body = event('chat.started');
      const h = sign(body);
      h['X-Chatim-Timestamp'] = String(now() + 1);
      expect((await post(body, h)).status).toBe(401);
    });

    it('rejects a missing or empty signature', async () => {
      const body = event('chat.started');
      const h = sign(body);
      expect((await post(body, { 'X-Chatim-Timestamp': h['X-Chatim-Timestamp'] })).status).toBe(401);
      expect((await post(body, { ...h, 'X-Chatim-Signature': '' })).status).toBe(401);
    });

    it('rejects a missing or empty timestamp header', async () => {
      const body = event('chat.started');
      const h = sign(body);
      expect((await post(body, { 'X-Chatim-Signature': h['X-Chatim-Signature'] })).status).toBe(401);
      expect((await post(body, { ...h, 'X-Chatim-Timestamp': '' })).status).toBe(401);
    });

    it('rejects malformed signatures', async () => {
      const body = event('chat.started');
      const { 'X-Chatim-Timestamp': ts } = sign(body);
      const good = sign(body)['X-Chatim-Signature'].slice(7);
      for (const bad of [
        'sha256=abc123',
        'sha256=' + 'zz'.repeat(32),
        'sha256=' + good + '00',
        'sha256=' + good.slice(0, 62) + '  ',
        'sha1=' + good,
        'not-a-signature',
      ]) {
        const res = await post(body, { 'X-Chatim-Signature': bad, 'X-Chatim-Timestamp': ts });
        expect(res.status).toBe(401);
      }
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.CHATIM_WEBHOOK_SECRET;
      const body = event('chat.started');
      expect((await post(body, sign(body))).status).toBe(500);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const old = now() - 3600;

    it('does not reject old timestamps by default', async () => {
      const body = event('chat.started');
      expect((await post(body, sign(body, { timestamp: old }))).status).toBe(200);
    });

    it('rejects old timestamps when CHATIM_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
      process.env.CHATIM_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event('chat.started');
      expect((await post(body, sign(body, { timestamp: old }))).status).toBe(401);
      expect((await post(body, sign(body))).status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.CHATIM_WEBHOOK_TOLERANCE_SECONDS = '0';
      const body = event('chat.started');
      expect((await post(body, sign(body, { timestamp: old }))).status).toBe(200);
    });
  });

  describe('event handling', () => {
    const events = [
      'chat.started',
      'chat.message.received',
      'chat.form.submitted',
      'chat.closed',
      'chat.assigned',
      'chat.handoff',
    ];

    it.each(events)('handles %s', async (name) => {
      const body = event(name);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled event'));
    });

    it('logs unknown events and still returns 200', async () => {
      const body = event('chat.something.else');
      expect((await post(body, sign(body))).status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Unhandled event: chat.something.else');
    });

    it('returns 400 for a validly signed non-JSON body', async () => {
      const body = 'not json';
      expect((await post(body, sign(body))).status).toBe(400);
    });
  });
});
