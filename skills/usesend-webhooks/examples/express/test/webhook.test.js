const crypto = require('crypto');
const request = require('supertest');

// useSend secrets look like whsec_...; the WHOLE string is the HMAC key.
const SECRET = 'whsec_test_secret_key_for_usesend';
process.env.USESEND_WEBHOOK_SECRET = SECRET;

const { app, verifyUseSend } = require('../src/index');

// Payload shaped like useSend's documented email.delivered example.
const deliveredPayload = {
  id: 'call_abc123',
  type: 'email.delivered',
  version: '2026-01-18',
  createdAt: '2024-01-15T10:30:00.000Z',
  teamId: 123,
  data: {
    id: 'email_123',
    status: 'DELIVERED',
    from: 'sender@example.com',
    to: ['recipient@example.com'],
    subject: 'Welcome!',
    occurredAt: '2024-01-15T10:30:00Z',
  },
  attempt: 1,
};

// Signs exactly like useSend: HMAC-SHA256(secret, `${timestamp}.${rawBody}`), hex.
function sign(body, timestamp, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function post(body, { signature, timestamp = String(Date.now()), contentType = 'application/json' } = {}) {
  const sig = signature === undefined ? `v1=${sign(body, timestamp)}` : signature;
  const req = request(app).post('/webhooks/usesend').set('Content-Type', contentType);
  if (sig !== null) req.set('X-UseSend-Signature', sig);
  if (timestamp !== null) req.set('X-UseSend-Timestamp', timestamp);
  return req.send(body);
}

describe('useSend webhook handler', () => {
  afterEach(() => {
    delete process.env.USESEND_WEBHOOK_TOLERANCE_SECONDS;
  });

  it('accepts a valid v1= signature', async () => {
    const res = await post(JSON.stringify(deliveredPayload));
    expect(res.status).toBe(200);
  });

  it('accepts a bare digest without the v1= prefix', async () => {
    const body = JSON.stringify(deliveredPayload);
    const ts = String(Date.now());
    const res = await post(body, { timestamp: ts, signature: sign(body, ts) });
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    const body = JSON.stringify(deliveredPayload);
    const ts = String(Date.now());
    const res = await post(body, { timestamp: ts, signature: `v1=${sign(body, ts).toUpperCase()}` });
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, whatever the content type', async () => {
    const body = JSON.stringify(deliveredPayload, null, 2);
    const res = await post(body, { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('handles the webhook.test event', async () => {
    const body = JSON.stringify({ test: true, webhookId: 'wh_abc123', sentAt: '2024-01-15T10:30:00.000Z', type: 'webhook.test' });
    const res = await post(body);
    expect(res.status).toBe(200);
  });

  it.each(['email.bounced', 'email.complained', 'email.opened', 'email.clicked', 'contact.created', 'domain.verified', 'email.queued'])(
    'accepts %s',
    async (type) => {
      const res = await post(JSON.stringify({ ...deliveredPayload, type }));
      expect(res.status).toBe(200);
    }
  );

  it('rejects a wrong secret', async () => {
    const body = JSON.stringify(deliveredPayload);
    const ts = String(Date.now());
    const res = await post(body, { timestamp: ts, signature: `v1=${sign(body, ts, 'whsec_other')}` });
    expect(res.status).toBe(401);
  });

  it('rejects a secret with the whsec_ prefix stripped', async () => {
    const body = JSON.stringify(deliveredPayload);
    const ts = String(Date.now());
    const res = await post(body, { timestamp: ts, signature: `v1=${sign(body, ts, SECRET.replace('whsec_', ''))}` });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const ts = String(Date.now());
    const sig = `v1=${sign(JSON.stringify(deliveredPayload), ts)}`;
    const res = await post(JSON.stringify({ ...deliveredPayload, id: 'call_evil' }), { timestamp: ts, signature: sig });
    expect(res.status).toBe(401);
  });

  it('rejects a signature made over a different timestamp', async () => {
    const body = JSON.stringify(deliveredPayload);
    const res = await post(body, { timestamp: '1700000000001', signature: `v1=${sign(body, '1700000000000')}` });
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(JSON.stringify(deliveredPayload), { signature: null });
    expect(res.status).toBe(401);
  });

  it('rejects a missing timestamp header', async () => {
    const res = await post(JSON.stringify(deliveredPayload), { timestamp: null, signature: `v1=${'a'.repeat(64)}` });
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    const res = await post(JSON.stringify(deliveredPayload), { signature: '' });
    expect(res.status).toBe(401);
  });

  it.each([
    ['too short', `v1=${'a'.repeat(63)}`],
    ['too long', `v1=${'a'.repeat(65)}`],
    ['non-hex characters', `v1=${'z'.repeat(64)}`],
    ['only the prefix', 'v1='],
  ])('rejects a malformed signature (%s)', async (_name, signature) => {
    const res = await post(JSON.stringify(deliveredPayload), { signature });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
  });

  it('does not reject old timestamps by default', async () => {
    const body = JSON.stringify(deliveredPayload);
    const ts = String(Date.now() - 24 * 60 * 60 * 1000);
    const res = await post(body, { timestamp: ts, signature: `v1=${sign(body, ts)}` });
    expect(res.status).toBe(200);
  });

  describe('opt-in timestamp tolerance', () => {
    it('rejects an old timestamp when tolerance is set', async () => {
      process.env.USESEND_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = JSON.stringify(deliveredPayload);
      const ts = String(Date.now() - 10 * 60 * 1000);
      const res = await post(body, { timestamp: ts, signature: `v1=${sign(body, ts)}` });
      expect(res.status).toBe(401);
    });

    it('accepts a fresh timestamp (milliseconds) when tolerance is set', async () => {
      process.env.USESEND_WEBHOOK_TOLERANCE_SECONDS = '300';
      const res = await post(JSON.stringify(deliveredPayload));
      expect(res.status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.USESEND_WEBHOOK_TOLERANCE_SECONDS = '0';
      const body = JSON.stringify(deliveredPayload);
      const ts = String(Date.now() - 24 * 60 * 60 * 1000);
      const res = await post(body, { timestamp: ts, signature: `v1=${sign(body, ts)}` });
      expect(res.status).toBe(200);
    });
  });
});

describe('verifyUseSend', () => {
  it('returns false for a missing secret', () => {
    expect(verifyUseSend(Buffer.from('x'), `v1=${'a'.repeat(64)}`, '1', '')).toBe(false);
  });

  it('verifies a body containing non-UTF-8 bytes', () => {
    const body = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
    const ts = '1700000000000';
    const digest = crypto
      .createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from(ts), Buffer.from('.'), body]))
      .digest('hex');
    expect(verifyUseSend(body, `v1=${digest}`, ts, SECRET)).toBe(true);
  });
});
