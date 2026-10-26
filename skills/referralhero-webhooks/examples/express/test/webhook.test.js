// Generated with: referralhero-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'rh_test_webhook_secret_key_0123456789';
process.env.REFERRALHERO_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** Sign exactly like ReferralHero: base64 (standard, padded) HMAC-SHA256 of the raw body. */
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

function send(body, { signature, contentType = 'application/json', secret } = {}) {
  const req = request(app).post('/webhooks/referralhero').set('Content-Type', contentType);
  const sig = signature === undefined ? sign(body, secret) : signature;
  if (sig !== null) req.set('X-ReferralHero-Signature', sig);
  return req.send(body);
}

const event = (name, extra = {}) => JSON.stringify({ response: name, ...extra });

describe('ReferralHero webhook', () => {
  it.each([
    'new_registration',
    'subscriber_promoted',
    'subscriber_updated',
    'subscriber_fields_updated',
    'subscriber_deleted',
    'reward_unlocked',
    'reward_sent',
  ])('accepts a validly signed %s with a blank 200 body', async (name) => {
    const res = await send(event(name, { subscriber: { id: 'sub_1' } }));
    expect(res.status).toBe(200);
    expect(res.text).toBe('');
  });

  it('accepts and logs an unknown event type', async () => {
    const res = await send(event('something_new'));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, whitespace included', async () => {
    const res = await send('{ "response" :  "new_registration" }\n');
    expect(res.status).toBe(200);
  });

  it('accepts any content type', async () => {
    const res = await send(event('reward_sent'), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature with 401', async () => {
    const res = await send(event('new_registration'), { signature: null });
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature with 401', async () => {
    const res = await send(event('new_registration'), { signature: '' });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body with 401', async () => {
    const body = event('new_registration');
    const res = await send(body.replace('new_registration', 'reward_sent'), { signature: sign(body) });
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await send(event('new_registration'), { secret: 'another-secret' });
    expect(res.status).toBe(401);
  });

  it('rejects a hex-encoded digest', async () => {
    const body = event('new_registration');
    const hex = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect((await send(body, { signature: hex })).status).toBe(401);
  });

  it('rejects a prefixed signature value', async () => {
    const body = event('new_registration');
    expect((await send(body, { signature: `sha256=${sign(body)}` })).status).toBe(401);
  });

  it('rejects base64 that decodes to the same bytes but is not canonical', async () => {
    const body = event('new_registration');
    const good = sign(body);
    // The last base64 character before "=" carries 4 unused bits; flip one.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const idx = alphabet.indexOf(good[42]);
    const variant = good.slice(0, 42) + alphabet[idx ^ 1] + '=';
    expect(Buffer.from(variant, 'base64').equals(Buffer.from(good, 'base64'))).toBe(true);
    expect((await send(body, { signature: variant })).status).toBe(401);
  });

  it('rejects a signed body that is not JSON with 400', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
  });

  it('fails closed with 500 when no secret is configured', async () => {
    delete process.env.REFERRALHERO_WEBHOOK_SECRET;
    try {
      const res = await send(event('new_registration'));
      expect(res.status).toBe(500);
    } finally {
      process.env.REFERRALHERO_WEBHOOK_SECRET = SECRET;
    }
  });
});
