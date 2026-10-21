// Generated with: mailparser-webhooks skill
// https://github.com/hookdeck/webhook-skills

const request = require('supertest');
const { app, headerName, verifyMailparserHeader, bodyHash } = require('../src/index');

// Mailparser has no signature: the credential is the exact Additional Header
// value configured on the webhook (a secret header, or Basic Auth as in the docs).
const SECRET = 'c0ffee5ecret9f8e7d6c5b4a3928170615';
const BASIC = `Basic ${Buffer.from('mailparser:s3cr3t-p@ss').toString('base64')}`;

// Body is whatever the HTTP Body Payload Template renders.
const PARSED = {
  invoice_number: 'INV-1042',
  total: '129.00',
  from: 'billing@example.com',
};

describe('Mailparser webhook', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.MAILPARSER_WEBHOOK_HEADER = 'X-Webhook-Secret';
    process.env.MAILPARSER_WEBHOOK_SECRET = SECRET;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  const post = (headers, body = JSON.stringify(PARSED)) =>
    request(app)
      .post('/webhooks/mailparser')
      .set({ 'Content-Type': 'application/json', ...headers })
      .send(body);

  test('accepts the configured secret header', async () => {
    const res = await post({ 'X-Webhook-Secret': SECRET });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('header name matching is case-insensitive', async () => {
    const res = await post({ 'x-webhook-secret': SECRET });
    expect(res.status).toBe(200);
  });

  test('accepts Basic Auth in the Authorization header', async () => {
    process.env.MAILPARSER_WEBHOOK_HEADER = 'Authorization';
    process.env.MAILPARSER_WEBHOOK_SECRET = BASIC;
    const res = await post({ Authorization: BASIC });
    expect(res.status).toBe(200);
  });

  test('rejects Basic Auth value without its scheme prefix', async () => {
    process.env.MAILPARSER_WEBHOOK_HEADER = 'Authorization';
    process.env.MAILPARSER_WEBHOOK_SECRET = BASIC;
    const res = await post({ Authorization: BASIC.replace('Basic ', '') });
    expect(res.status).toBe(401);
  });

  test('rejects a wrong secret', async () => {
    const res = await post({ 'X-Webhook-Secret': 'wrong' });
    expect(res.status).toBe(401);
  });

  test('rejects a secret of the same length', async () => {
    const res = await post({ 'X-Webhook-Secret': 'x'.repeat(SECRET.length) });
    expect(res.status).toBe(401);
  });

  test('rejects a missing header', async () => {
    const res = await post({});
    expect(res.status).toBe(401);
  });

  test('returns 500 when no secret is configured', async () => {
    delete process.env.MAILPARSER_WEBHOOK_SECRET;
    const res = await post({ 'X-Webhook-Secret': SECRET });
    expect(res.status).toBe(500);
  });

  test('returns 400 for invalid JSON after authenticating', async () => {
    const res = await post({ 'X-Webhook-Secret': SECRET }, '{not json');
    expect(res.status).toBe(400);
  });

  test('returns 400 for a non-object JSON body', async () => {
    const res = await post({ 'X-Webhook-Secret': SECRET }, '[1,2]');
    expect(res.status).toBe(400);
  });

  test('does not leak parse errors to unauthenticated callers', async () => {
    const res = await post({ 'X-Webhook-Secret': 'wrong' }, '{not json');
    expect(res.status).toBe(401);
  });

  test('defaults the header name to x-webhook-secret', () => {
    expect(headerName({})).toBe('x-webhook-secret');
    expect(headerName({ MAILPARSER_WEBHOOK_HEADER: ' Authorization ' })).toBe('authorization');
  });

  test('verifyMailparserHeader fails closed and handles length mismatch', () => {
    expect(verifyMailparserHeader(undefined, SECRET)).toBe(false);
    expect(verifyMailparserHeader(SECRET, undefined)).toBe(false);
    expect(verifyMailparserHeader('short', SECRET)).toBe(false);
    expect(verifyMailparserHeader(SECRET, SECRET)).toBe(true);
  });

  test('bodyHash is a stable sha256 hex digest', () => {
    const h = bodyHash(Buffer.from('abc'));
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
