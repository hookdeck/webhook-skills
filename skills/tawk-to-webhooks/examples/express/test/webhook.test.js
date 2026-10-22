const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_tawk_webhook_secret';
process.env.TAWK_WEBHOOK_SECRET = SECRET;

const { app, verifyTawkSignature } = require('../src/index');

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha1', secret).update(body).digest('hex');
}

const chatStart = JSON.stringify({
  event: 'chat:start',
  chatId: '70fe3290-99ad-11e9-a30a-51567162179f',
  time: '2019-06-28T14:03:04.646Z',
  visitor: { name: 'V1561719148780935' },
  property: { id: '58ca8453b8a7e060cd3b1ecb', name: 'Bobs Burgers' },
});

describe('verifyTawkSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifyTawkSignature(Buffer.from(chatStart), sign(chatStart), SECRET)).toBe(true);
  });
  it('rejects wrong secret, missing header and length mismatch', () => {
    expect(verifyTawkSignature(Buffer.from(chatStart), sign(chatStart, 'other'), SECRET)).toBe(false);
    expect(verifyTawkSignature(Buffer.from(chatStart), undefined, SECRET)).toBe(false);
    expect(verifyTawkSignature(Buffer.from(chatStart), 'abc', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/tawk-to', () => {
  const post = (body, sig, type = 'application/json') =>
    request(app).post('/webhooks/tawk-to').set('Content-Type', type).set('X-Tawk-Signature', sig).send(body);

  it.each([
    ['chat:start', chatStart],
    ['chat:end', JSON.stringify({ event: 'chat:end', chatId: 'c1' })],
    ['chat:transcript_created', JSON.stringify({ event: 'chat:transcript_created', chat: { id: 'c1', messages: [] } })],
    ['ticket:create', JSON.stringify({ event: 'ticket:create', ticket: { id: 't1', subject: 'Hi' } })],
  ])('accepts a signed %s event', async (_name, body) => {
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const res = await post(chatStart, sign(chatStart), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('accepts unknown events', async () => {
    const body = JSON.stringify({ event: 'other:event' });
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    expect((await post(chatStart, sign(chatStart, 'wrong'))).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    expect((await post(chatStart + ' ', sign(chatStart))).status).toBe(400);
  });

  it('rejects a missing signature', async () => {
    const res = await request(app).post('/webhooks/tawk-to').set('Content-Type', 'application/json').send(chatStart);
    expect(res.status).toBe(400);
  });

  it('rejects signed invalid JSON', async () => {
    const body = 'not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});
