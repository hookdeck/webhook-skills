const request = require('supertest');
const crypto = require('crypto');

// BoldSign signing secrets are opaque strings; this one is only for tests
const SECRET = 'test_boldsign_secret_5f0c1a7e';
const OLD_SECRET = 'old_boldsign_secret_9d2b4c8f';
process.env.BOLDSIGN_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

const now = () => Math.floor(Date.now() / 1000);

// Matches BoldSign's header format, including the space after the comma
function sign(body, { timestamp = now(), secret = SECRET, oldSecret } = {}) {
  const hmac = (key) => crypto.createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex');
  let header = `t=${timestamp}, s0=${hmac(secret)}`;
  if (oldSecret) header += `, s1=${hmac(oldSecret)}`;
  return header;
}

function event(eventType, data = {}) {
  return JSON.stringify({
    event: { id: 'afceddb1-2eed-4301-ae14-8b96a6b0393a', created: 1669959514, eventType, environment: 'Test' },
    data: { object: 'document', documentId: '26b8695f-46d0-4cd4-ba1a-c5a0d595c849', messageTitle: 'NDA', ...data },
  });
}

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/boldsign')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

describe('BoldSign webhook', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS;
    process.env.BOLDSIGN_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => jest.restoreAllMocks());

  describe('signature verification', () => {
    it('accepts a valid s0 signature', async () => {
      const body = event('Signed');
      const res = await post(body, { 'X-BoldSign-Event': 'Signed', 'X-BoldSign-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts a match on s1 during key rollover', async () => {
      const body = event('Completed');
      // Header signed with the new key as s0 but an unrelated secret; s1 matches ours
      const header = sign(body, { secret: 'some_other_current_key', oldSecret: SECRET });
      const res = await post(body, { 'X-BoldSign-Signature': header });
      expect(res.status).toBe(200);
    });

    it('accepts a match on s0 when s1 is present and stale', async () => {
      const body = event('Completed');
      const res = await post(body, { 'X-BoldSign-Signature': sign(body, { oldSecret: OLD_SECRET }) });
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const body = event('Viewed');
      const res = await request(app)
        .post('/webhooks/boldsign')
        .set('Content-Type', 'text/plain')
        .set('X-BoldSign-Signature', sign(body))
        .send(body);
      expect(res.status).toBe(200);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const body = event('Signed');
      const res = await post(body, { 'X-BoldSign-Signature': sign(body, { secret: 'wrong_secret' }) });
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const body = event('Signed');
      const res = await post(event('Declined'), { 'X-BoldSign-Signature': sign(body) });
      expect(res.status).toBe(400);
    });

    it('rejects a tampered timestamp', async () => {
      const body = event('Signed');
      const header = sign(body).replace(/t=\d+/, `t=${now() + 1}`);
      const res = await post(body, { 'X-BoldSign-Signature': header });
      expect(res.status).toBe(400);
    });

    it('rejects a missing signature header', async () => {
      const res = await post(event('Signed'));
      expect(res.status).toBe(400);
    });

    it.each(['garbage', 't=abc, s0=deadbeef', 't=123', 's0=deadbeef', 't=123, s0=short'])(
      'rejects malformed header %j without throwing',
      async (header) => {
        const res = await post(event('Signed'), { 'X-BoldSign-Signature': header });
        expect(res.status).toBe(400);
      }
    );

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.BOLDSIGN_WEBHOOK_SECRET;
      const body = event('Signed');
      const res = await post(body, { 'X-BoldSign-Signature': sign(body) });
      expect(res.status).toBe(500);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const old = now() - 3600;

    it('is off by default: an hour-old timestamp with a valid signature is accepted', async () => {
      const body = event('Signed');
      const res = await post(body, { 'X-BoldSign-Signature': sign(body, { timestamp: old }) });
      expect(res.status).toBe(200);
    });

    it('rejects old timestamps when BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS is positive', async () => {
      process.env.BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS = '300';
      const body = event('Signed');
      const res = await post(body, { 'X-BoldSign-Signature': sign(body, { timestamp: old }) });
      expect(res.status).toBe(400);
    });

    it('accepts fresh timestamps when the tolerance is set', async () => {
      process.env.BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS = '300';
      const body = event('Signed');
      const res = await post(body, { 'X-BoldSign-Signature': sign(body) });
      expect(res.status).toBe(200);
    });

    it('treats a non-numeric value as off', async () => {
      process.env.BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
      const body = event('Signed');
      const res = await post(body, { 'X-BoldSign-Signature': sign(body, { timestamp: old }) });
      expect(res.status).toBe(200);
    });
  });

  describe('verification event', () => {
    it('returns 200 for the setup Verification POST without a signature', async () => {
      const body = event('Verification');
      const res = await post(body, { 'X-BoldSign-Event': 'Verification' });
      expect(res.status).toBe(200);
    });

    it('returns 200 for Verification even if no secret is configured yet', async () => {
      delete process.env.BOLDSIGN_WEBHOOK_SECRET;
      const res = await post(event('Verification'), { 'X-BoldSign-Event': 'Verification' });
      expect(res.status).toBe(200);
    });
  });

  describe('event handling', () => {
    it.each(['Sent', 'Viewed', 'Signed', 'Completed', 'Declined', 'Revoked', 'Expired'])(
      'handles %s',
      async (eventType) => {
        const body = event(eventType);
        const res = await post(body, { 'X-BoldSign-Event': eventType, 'X-BoldSign-Signature': sign(body) });
        expect(res.status).toBe(200);
        expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
      }
    );

    it('acknowledges unhandled events', async () => {
      const body = event('TemplateCreated');
      const res = await post(body, { 'X-BoldSign-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Unhandled event: TemplateCreated');
    });

    it('rejects a validly signed body that is not JSON', async () => {
      const body = 'not json';
      const res = await post(body, { 'X-BoldSign-Signature': sign(body) });
      expect(res.status).toBe(400);
    });
  });
});
