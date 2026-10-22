const crypto = require('crypto');
const request = require('supertest');

const TOKEN = 'test_unit_webhook_token';
process.env.UNIT_WEBHOOK_TOKEN = TOKEN;

const app = require('../src/index');

// Matches Unit: base64 HMAC-SHA1 of the raw body, keyed by the webhook token.
function sign(body, token = TOKEN) {
  return crypto.createHmac('sha1', token).update(body).digest('base64');
}

function eventBody(type, id = '269') {
  return JSON.stringify({
    data: [
      {
        id,
        type,
        attributes: { createdAt: '2021-04-13T07:40:43.813Z' },
        relationships: { account: { data: { id: '10004', type: 'account' } } },
      },
    ],
  });
}

function post(body, signature, contentType = 'application/vnd.api+json') {
  const req = request(app).post('/webhooks/unit').set('Content-Type', contentType);
  if (signature !== undefined) req.set('X-Unit-Signature', signature);
  return req.send(body);
}

describe('Unit webhook', () => {
  it.each([
    'account.created',
    'customer.created',
    'transaction.created',
    'payment.clearing',
    'application.approved',
  ])('accepts a valid %s event', async (type) => {
    const body = eventBody(type);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = eventBody('account.created');
    for (const ct of ['application/json', 'text/plain']) {
      const res = await post(body, sign(body), ct);
      expect(res.status).toBe(200);
    }
  });

  it('accepts a batched delivery with several events', async () => {
    const body = JSON.stringify({
      data: [
        { id: '1', type: 'customer.created', attributes: {}, relationships: {} },
        { id: '2', type: 'account.created', attributes: {}, relationships: {} },
      ],
    });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('accepts unknown event types', async () => {
    const body = eventBody('somethingNew.happened');
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = eventBody('account.created');
    const res = await post(body, sign(body, 'wrong_token'));
    expect(res.status).toBe(400);
  });

  it('rejects a signature that differs in length', async () => {
    const body = eventBody('account.created');
    const res = await post(body, 'short');
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const body = eventBody('account.created');
    const res = await post(body, undefined);
    expect(res.status).toBe(400);
  });

  it('rejects a body modified after signing', async () => {
    const body = eventBody('account.created');
    const res = await post(body.replace('269', '999'), sign(body));
    expect(res.status).toBe(400);
  });

  it('rejects a re-serialized body (whitespace changes the HMAC)', async () => {
    const body = eventBody('account.created');
    const res = await post(JSON.stringify(JSON.parse(body), null, 2), sign(body));
    expect(res.status).toBe(400);
  });

  it('rejects a validly signed but malformed JSON body', async () => {
    const body = '{not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  it('serves the health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
