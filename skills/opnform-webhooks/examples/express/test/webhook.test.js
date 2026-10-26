const crypto = require('crypto');
const request = require('supertest');

// OpnForm webhook secrets are chosen by the user (12+ characters); this one is only for tests
const SECRET = 'test_opnform_secret_5f0c1a7e';
process.env.OPNFORM_WEBHOOK_SECRET = SECRET;

const { app, verifyOpnform } = require('../src/index');

// Based on the submission sample in OpnForm's webhook docs
const payload = {
  form_id: 123,
  form_title: 'Contact Form',
  form_slug: 'contact-form',
  submission_id: 456,
  edit_link: 'https://opnform.com/forms/contact-form?submission_id=example',
  submission: { Name: 'Jane Doe' },
  data: { 'field-id': { value: 'Jane Doe', name: 'Name', type: 'text' } },
  meta: { attribution: { utm_source: 'newsletter', utm_campaign: 'summer-launch' } },
};
const body = JSON.stringify(payload);

const digest = (b, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(b).digest('hex');
// Matches OpnForm's header format: sha256=<hex>
const sign = (b, secret = SECRET) => `sha256=${digest(b, secret)}`;

const post = (b, headers = {}) =>
  request(app)
    .post('/webhooks/opnform')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(b);

describe('OpnForm webhook', () => {
  beforeEach(() => {
    process.env.OPNFORM_WEBHOOK_SECRET = SECRET;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a valid sha256= signature', async () => {
    const res = await post(body, { 'X-Webhook-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts the bare digest without the prefix', async () => {
    const res = await post(body, { 'X-Webhook-Signature': digest(body) });
    expect(res.status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const res = await post(body, { 'X-Webhook-Signature': `sha256=${digest(body).toUpperCase()}` });
    expect(res.status).toBe(200);
  });

  it('verifies any content type against the raw bytes', async () => {
    const res = await request(app)
      .post('/webhooks/opnform')
      .set('Content-Type', 'text/plain')
      .set('X-Webhook-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, not a re-serialized body', async () => {
    const pretty = JSON.stringify(payload, null, 2);
    expect((await post(pretty, { 'X-Webhook-Signature': sign(pretty) })).status).toBe(200);
    // A signature over the compact form must not match the pretty-printed bytes
    expect((await post(pretty, { 'X-Webhook-Signature': sign(body) })).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(body)).status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    expect((await post(body, { 'X-Webhook-Signature': '' })).status).toBe(401);
  });

  it('rejects a signature from the wrong secret', async () => {
    const res = await post(body, { 'X-Webhook-Signature': sign(body, 'another_secret_value') });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const tampered = JSON.stringify({ ...payload, submission_id: 457 });
    expect((await post(tampered, { 'X-Webhook-Signature': sign(body) })).status).toBe(401);
  });

  it.each([
    ['prefix only', 'sha256='],
    ['too short', 'sha256=abcd'],
    ['too long', `sha256=${digest(body)}00`],
    ['non-hex characters', `sha256=${'z'.repeat(64)}`],
    ['wrong prefix', `sha1=${digest(body)}`],
    ['base64 digest', `sha256=${crypto.createHmac('sha256', SECRET).update(body).digest('base64')}`],
  ])('rejects a malformed signature (%s)', async (_name, header) => {
    const res = await post(body, { 'X-Webhook-Signature': header });
    expect(res.status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.OPNFORM_WEBHOOK_SECRET;
    const res = await post(body, { 'X-Webhook-Signature': sign(body) });
    expect(res.status).toBe(500);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const bad = 'not json';
    const res = await post(bad, { 'X-Webhook-Signature': sign(bad) });
    expect(res.status).toBe(400);
  });

  it.each([['an array', '[1,2]'], ['null', 'null'], ['a string', '"hi"']])(
    'returns 400 when the signed JSON is %s',
    async (_name, raw) => {
      const res = await post(raw, { 'X-Webhook-Signature': sign(raw) });
      expect(res.status).toBe(400);
    }
  );

  it('does not 500 on wrong-typed fields', async () => {
    const odd = JSON.stringify({
      form_id: { a: 1 },
      form_title: 42,
      submission_id: [1],
      submission: 'a string',
      data: [],
      meta: 'x',
    });
    const res = await post(odd, { 'X-Webhook-Signature': sign(odd) });
    expect(res.status).toBe(200);
  });

  it('does not 500 on an empty object', async () => {
    const res = await post('{}', { 'X-Webhook-Signature': sign('{}') });
    expect(res.status).toBe(200);
  });
});

describe('verifyOpnform', () => {
  const raw = Buffer.from(body);

  it('returns false without a secret or header', () => {
    expect(verifyOpnform(raw, sign(body), '')).toBe(false);
    expect(verifyOpnform(raw, undefined, SECRET)).toBe(false);
  });

  it('uses the secret as UTF-8 bytes, not hex-decoded', () => {
    const hexLooking = 'abcdef0123456789abcdef';
    const header = `sha256=${crypto.createHmac('sha256', Buffer.from(hexLooking, 'hex')).update(raw).digest('hex')}`;
    expect(verifyOpnform(raw, header, hexLooking)).toBe(false);
    expect(verifyOpnform(raw, sign(body, hexLooking), hexLooking)).toBe(true);
  });
});
