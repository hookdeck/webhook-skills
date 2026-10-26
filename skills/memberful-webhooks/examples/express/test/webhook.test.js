const crypto = require('crypto');
const request = require('supertest');

// Set test environment variables before importing the app.
const SECRET = 'test_memberful_webhook_secret';
process.env.MEMBERFUL_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyMemberfulSignature } = require('../src/index');

// The docs never show the payload; `event` at the top level is an assumption.
const samplePayload = (event = 'subscription.created', extra) => ({
  event,
  subscription: { id: 1234, autorenew: true },
  member: { id: 42, email: 'jane@example.com' },
  ...extra,
});

// Real signature, same as Memberful: lowercase hex HMAC-SHA256 of the raw body, nothing else.
const sign = (body, secret = SECRET) => crypto.createHmac('sha256', secret).update(body).digest('hex');

function send(body, { signature, contentType = 'application/json', method = 'post' } = {}) {
  const req = request(app)[method]('/webhooks/memberful');
  if (body !== null && body !== undefined) req.set('Content-Type', contentType).send(body);
  const sig = signature === undefined ? sign(body ?? '') : signature;
  if (sig !== null) req.set('X-Memberful-Webhook-Signature', sig);
  return req;
}

describe('Memberful webhook endpoint', () => {
  describe('signature verification', () => {
    const body = JSON.stringify(samplePayload());

    it('accepts a valid signature', async () => {
      const res = await send(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts an uppercase hex signature (hex is case-insensitive)', async () => {
      expect((await send(body, { signature: sign(body).toUpperCase() })).status).toBe(200);
    });

    it('rejects a missing signature', async () => {
      expect((await send(body, { signature: null })).status).toBe(401);
    });

    it('rejects an empty signature', async () => {
      expect((await send(body, { signature: '' })).status).toBe(401);
    });

    it('rejects a wrong signature of the right shape', async () => {
      expect((await send(body, { signature: 'a'.repeat(64) })).status).toBe(401);
    });

    it('rejects a signature made with another secret', async () => {
      expect((await send(body, { signature: sign(body, 'other') })).status).toBe(401);
    });

    it('rejects a short signature', async () => {
      expect((await send(body, { signature: sign(body).slice(0, 62) })).status).toBe(401);
    });

    it('rejects a long signature', async () => {
      expect((await send(body, { signature: sign(body) + 'ab' })).status).toBe(401);
    });

    it('rejects a non-hex signature of the right length', async () => {
      expect((await send(body, { signature: 'z'.repeat(64) })).status).toBe(401);
    });

    it('rejects a prefixed signature (the header is the bare digest)', async () => {
      expect((await send(body, { signature: `sha256=${sign(body)}` })).status).toBe(401);
    });

    it('rejects a body changed after signing', async () => {
      const res = await send(body.replace('jane', 'evil'), { signature: sign(body) });
      expect(res.status).toBe(401);
    });

    it('verifies the exact bytes: reformatted JSON with the same content fails', async () => {
      const pretty = JSON.stringify(samplePayload(), null, 2);
      expect((await send(pretty, { signature: sign(body) })).status).toBe(401);
    });

    it('verifies the exact bytes including non-ASCII characters and a trailing newline', async () => {
      const raw = JSON.stringify(samplePayload('member_signup', { member: { id: 1, full_name: 'Zoë' } })) + '\n';
      expect((await send(raw)).status).toBe(200);
    });

    it('verifies the secret as UTF-8 bytes (no hex or base64 decoding)', () => {
      const raw = Buffer.from('{}');
      expect(verifyMemberfulSignature(raw, sign(raw, 'deadbeef'), 'deadbeef')).toBe(true);
      expect(verifyMemberfulSignature(raw, sign(raw, 'deadbeef'), 'deadbeee')).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const raw = Buffer.from('{}');
      expect(verifyMemberfulSignature(raw, sign(raw, ''), '')).toBe(false);
    });
  });

  describe('methods and bodies', () => {
    const body = JSON.stringify(samplePayload());

    it.each(['get', 'put', 'patch', 'delete'])('answers 405 to %s', async (method) => {
      const res = await send(body, { method });
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe('POST');
    });

    it('accepts any content type', async () => {
      expect((await send(body, { contentType: 'text/plain' })).status).toBe(200);
      expect((await send(body, { contentType: 'application/octet-stream' })).status).toBe(200);
    });

    it('answers 400 for a signed body that is not JSON', async () => {
      expect((await send('not json')).status).toBe(400);
    });

    it('answers 400 for a signed empty body', async () => {
      expect((await send(null)).status).toBe(400);
    });

    it.each(['[]', '"text"', '42', 'null'])('answers 400 for signed non-object JSON %s', async (raw) => {
      expect((await send(raw)).status).toBe(400);
    });
  });

  describe('events', () => {
    const events = [
      'member_signup', 'member_updated', 'member.deleted', 'tax_id.updated', 'custom_fields.updated',
      'subscription.created', 'subscription.updated', 'subscription.renewed', 'subscription.activated',
      'subscription.reactivated', 'subscription.deactivated', 'subscription.deleted',
      'order.purchased', 'order.refunded', 'order.suspended', 'order.completed',
      'subscription_plan.created', 'subscription_plan.updated', 'subscription_plan.deleted',
      'download.created', 'download.updated', 'download.deleted',
    ];

    it.each(events)('handles %s', async (event) => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send(JSON.stringify(samplePayload(event)));
      expect(res.status).toBe(200);
      expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
      log.mockRestore();
    });

    it('logs and acknowledges an unknown event', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send(JSON.stringify(samplePayload('something.else')));
      expect(res.status).toBe(200);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Unhandled event: something.else'));
      log.mockRestore();
    });

    it('logs a payload without a top-level event field instead of failing', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send(JSON.stringify({ type: 'subscription.created' }));
      expect(res.status).toBe(200);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Unhandled event: undefined'));
      log.mockRestore();
    });

    it.each([
      ['member is a string', { event: 'member_signup', member: 'oops' }],
      ['subscription is an array', { event: 'subscription.created', subscription: [1, 2] }],
      ['order is null', { event: 'order.purchased', order: null }],
      ['id has the wrong type', { event: 'subscription.updated', subscription: { id: {} } }],
      ['event is a number', { event: 5 }],
    ])('does not 500 when %s', async (_name, payload) => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send(JSON.stringify(payload));
      expect(res.status).toBe(200);
      log.mockRestore();
    });
  });
});
