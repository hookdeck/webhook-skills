const request = require('supertest');
const crypto = require('crypto');

// The signing key is any string you choose in the Buttondown webhook settings.
// It is used as-is (UTF-8), not decoded. This one is only for tests.
const SECRET = 'test_buttondown_signing_key_long_and_random';
process.env.BUTTONDOWN_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

function hexFor(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const sign = (body, secret = SECRET) => `sha256=${hexFor(body, secret)}`;

// Content-Type is deliberately varied: verification must not depend on it
function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/buttondown').set('Content-Type', contentType);
  if (signature !== undefined) req.set('X-Buttondown-Signature', signature);
  return req.send(body);
}

const payload = (eventType, data) => JSON.stringify({ event_type: eventType, data });
const ids = {
  newsletter: '13121cd6-0dfc-424c-bb12-988b0a32fcb3',
  subscriber: 'ac79483b-cd28-49c1-982e-8a88e846d7e7',
};

// Shape from Buttondown's documentation
const confirmed = payload('subscriber.confirmed', ids);

describe('Buttondown webhook signature verification', () => {
  it('accepts a valid sha256= signature', async () => {
    const res = await post(confirmed, sign(confirmed));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts the bare digest without the prefix', async () => {
    expect((await post(confirmed, hexFor(confirmed))).status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    expect((await post(confirmed, `sha256=${hexFor(confirmed).toUpperCase()}`)).status).toBe(200);
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(confirmed, sign(confirmed), 'text/plain')).status).toBe(200);
  });

  it('verifies the exact bytes, including unusual whitespace and key order', async () => {
    const body = '{ "data" : {"subscriber":"s1",  "newsletter":"n1"},\n"event_type":"subscriber.created" }';
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('uses the signing key as plain UTF-8, not hex or base64 decoded', async () => {
    const key = crypto.randomBytes(16).toString('hex');
    process.env.BUTTONDOWN_WEBHOOK_SECRET = key;
    try {
      expect((await post(confirmed, sign(confirmed, key))).status).toBe(200);
      expect((await post(confirmed, sign(confirmed, Buffer.from(key, 'hex')))).status).toBe(401);
      expect((await post(confirmed, sign(confirmed, Buffer.from(key, 'base64')))).status).toBe(401);
    } finally {
      process.env.BUTTONDOWN_WEBHOOK_SECRET = SECRET;
    }
  });

  it('rejects a missing or empty signature header', async () => {
    expect((await post(confirmed, undefined)).status).toBe(401);
    expect((await post(confirmed, '')).status).toBe(401);
    expect((await post(confirmed, 'sha256=')).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(confirmed.replace('ac79', 'bc79'), sign(confirmed))).status).toBe(401);
  });

  it('rejects a signature made with the wrong key', async () => {
    expect((await post(confirmed, sign(confirmed, 'another_key'))).status).toBe(401);
  });

  it('rejects malformed signatures without throwing', async () => {
    const good = hexFor(confirmed);
    expect((await post(confirmed, 'sha256=abc')).status).toBe(401);
    expect((await post(confirmed, `sha256=${good}00`)).status).toBe(401);
    // 64 chars but not hex: Buffer.from(x, 'hex') would silently truncate it
    expect((await post(confirmed, `sha256=${'zz'.repeat(32)}`)).status).toBe(401);
    expect((await post(confirmed, `sha256=${'é'.repeat(64)}`)).status).toBe(401);
    expect((await post(confirmed, 'garbage')).status).toBe(401);
  });

  it('rejects a v1= or sha1= prefixed value', async () => {
    expect((await post(confirmed, `v1=${hexFor(confirmed)}`)).status).toBe(401);
    expect((await post(confirmed, `sha1=${hexFor(confirmed)}`)).status).toBe(401);
  });
});

describe('Buttondown events (dispatch on event_type)', () => {
  it.each([
    ['subscriber.created', ids],
    ['subscriber.confirmed', ids],
    ['subscriber.unsubscribed', ids],
    ['email.sent', { newsletter: ids.newsletter, email: 'e1' }],
    ['automation.invoked', { newsletter: ids.newsletter }],
    ['subscriber.paid', ids],
  ])('handles %s', async (eventType, data) => {
    const body = payload(eventType, data);
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      const logged = log.mock.calls.map((c) => c[0]).join('\n');
      if (eventType === 'subscriber.paid') expect(logged).toContain(`Unhandled event: ${eventType}`);
      else expect(logged).not.toContain('Unhandled');
    } finally {
      log.mockRestore();
    }
  });

  it('rejects verified but invalid JSON', async () => {
    const body = '{not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});
