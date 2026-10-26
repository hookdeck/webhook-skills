const crypto = require('crypto');
const request = require('supertest');

// Set test environment variables before importing the app.
const SECRET = 'test_reditus_webhook_secret';
process.env.REDITUS_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyReditusSignature } = require('../src/index');

// Payload shaped like the partnership.accepted example in Reditus's docs.
const samplePayload = (eventType = 'partnership.accepted', data) => ({
  event_type: eventType,
  url: 'destination-url@example.com',
  created_at: '2024-05-05',
  data: data ?? {
    affiliate_name: 'Acme',
    affiliate_email: 'john@acme.com',
    affiliate_first_name: 'John',
    affiliate_last_name: 'Doe',
    accepted_at: '2024-05-05',
  },
});

// Real signature, same as Reditus: lowercase hex HMAC-SHA256 of the raw body, nothing else.
const sign = (body, secret = SECRET) => crypto.createHmac('sha256', secret).update(body).digest('hex');

function send(method, body, { signature, contentType = 'application/json' } = {}) {
  const req = request(app)[method]('/webhooks/reditus');
  if (body !== null && body !== undefined) req.set('Content-Type', contentType).send(body);
  const sig = signature === undefined ? sign(body ?? '') : signature;
  if (sig !== null) req.set('X-Signature', sig);
  return req;
}

describe('Reditus webhook endpoint', () => {
  describe('signature verification', () => {
    const body = JSON.stringify(samplePayload());

    it('accepts a valid signature', async () => {
      const res = await send('post', body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts an uppercase hex signature (hex is case-insensitive)', async () => {
      const res = await send('post', body, { signature: sign(body).toUpperCase() });
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature', async () => {
      expect((await send('post', body, { signature: null })).status).toBe(401);
    });

    it('rejects an empty signature', async () => {
      expect((await send('post', body, { signature: '' })).status).toBe(401);
    });

    it('rejects a wrong signature of the right shape', async () => {
      expect((await send('post', body, { signature: 'a'.repeat(64) })).status).toBe(401);
    });

    it('rejects a signature made with another secret', async () => {
      expect((await send('post', body, { signature: sign(body, 'other') })).status).toBe(401);
    });

    it('rejects a short signature', async () => {
      expect((await send('post', body, { signature: sign(body).slice(0, 62) })).status).toBe(401);
    });

    it('rejects a long signature', async () => {
      expect((await send('post', body, { signature: sign(body) + 'ab' })).status).toBe(401);
    });

    it('rejects a non-hex signature of the right length', async () => {
      expect((await send('post', body, { signature: 'z'.repeat(64) })).status).toBe(401);
    });

    it('rejects a prefixed signature (the header is the bare digest)', async () => {
      expect((await send('post', body, { signature: `sha256=${sign(body)}` })).status).toBe(401);
    });

    it('rejects a body changed after signing', async () => {
      const res = await send('post', body.replace('Acme', 'Evil'), { signature: sign(body) });
      expect(res.status).toBe(401);
    });

    it('verifies the exact bytes: reformatted JSON with the same content fails', async () => {
      const pretty = JSON.stringify(samplePayload(), null, 2);
      const res = await send('post', pretty, { signature: sign(body) });
      expect(res.status).toBe(401);
    });

    it('verifies the exact bytes including non-ASCII characters and a trailing newline', async () => {
      const raw = JSON.stringify(samplePayload('lead.created', { lead_email: 'zoë@example.com' })) + '\n';
      expect((await send('post', raw)).status).toBe(200);
    });

    it('verifies the secret as UTF-8 bytes (no hex or base64 decoding)', () => {
      const raw = Buffer.from('{}');
      expect(verifyReditusSignature(raw, sign(raw, 'deadbeef'), 'deadbeef')).toBe(true);
      expect(verifyReditusSignature(raw, sign(raw, 'deadbeef'), 'deadbeee')).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const raw = Buffer.from('{}');
      expect(verifyReditusSignature(raw, sign(raw, ''), '')).toBe(false);
    });
  });

  describe('methods and bodies', () => {
    const body = JSON.stringify(samplePayload());

    it.each(['post', 'put', 'patch', 'delete'])('accepts a signed %s with a body', async (method) => {
      expect((await send(method, body)).status).toBe(200);
    });

    it.each(['post', 'put', 'patch', 'delete', 'get'])('rejects an unsigned %s', async (method) => {
      expect((await send(method, method === 'get' ? null : body, { signature: null })).status).toBe(401);
    });

    it('verifies a GET with no body over zero bytes and acknowledges it', async () => {
      const res = await send('get', null);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('rejects a GET with no body and a wrong signature', async () => {
      expect((await send('get', null, { signature: 'a'.repeat(64) })).status).toBe(401);
    });

    it('accepts any content type', async () => {
      expect((await send('post', body, { contentType: 'text/plain' })).status).toBe(200);
      expect((await send('post', body, { contentType: 'application/octet-stream' })).status).toBe(200);
    });

    it('answers 400 for a signed body that is not JSON', async () => {
      expect((await send('post', 'not json')).status).toBe(400);
    });

    it.each(['[]', '"text"', '42', 'null'])('answers 400 for signed non-object JSON %s', async (raw) => {
      expect((await send('post', raw)).status).toBe(400);
    });
  });

  describe('events', () => {
    const events = {
      'partnership.accepted': { affiliate_name: 'Acme', affiliate_email: 'john@acme.com' },
      'referral.created': { affiliate_email: 'a@example.com', referral_id: '6412-smga-1314-munw', referral_uid: 'r1', referral_email: 'john@example.com' },
      'advocate.created': { advocate_uid: 'u1', advocate_id: '6412-smga-1314-munw', advocate_slug: 'jwe512', advocate_email: 'john@example.com' },
      'lead.created': { advocate_uid: 'u1', lead_id: '6412-smga-1314-munw', lead_uid: 'l1', lead_email: 'john@example.com' },
      'reward.created': { amount: 5521, currency: 'usd', advocate_uid: 'u1', lead_id: 'l1', reward_id: '9182-agja-1891-awia', custom_text: 'Awesome Hoodie' },
    };

    it.each(Object.entries(events))('handles %s', async (eventType, data) => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send('post', JSON.stringify(samplePayload(eventType, data)));
      expect(res.status).toBe(200);
      expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
      log.mockRestore();
    });

    it('logs and acknowledges an unknown event', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send('post', JSON.stringify(samplePayload('something.else', {})));
      expect(res.status).toBe(200);
      expect(log).toHaveBeenCalledWith('Unhandled event: something.else');
      log.mockRestore();
    });

    it.each([
      ['data is a string', { event_type: 'lead.created', data: 'oops' }],
      ['data is an array', { event_type: 'reward.created', data: [1, 2] }],
      ['data is null', { event_type: 'referral.created', data: null }],
      ['fields have the wrong type', { event_type: 'reward.created', data: { amount: '55', currency: 7, reward_id: {} } }],
      ['event_type is a number', { event_type: 5, data: {} }],
      ['event_type is missing', { data: {} }],
    ])('does not 500 when %s', async (_name, payload) => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send('post', JSON.stringify(payload));
      expect(res.status).toBe(200);
      log.mockRestore();
    });
  });
});
