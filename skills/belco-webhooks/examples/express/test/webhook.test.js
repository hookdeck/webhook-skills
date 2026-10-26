const crypto = require('crypto');
const request = require('supertest');

process.env.BELCO_WEBHOOK_SECRET = 'belco_test_webhook_secret';
const { app, verifyBelcoSignature } = require('../src/index');

const SECRET = process.env.BELCO_WEBHOOK_SECRET;

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Shapes from Belco's "Sample payloads" and "Supported events" docs
const created = JSON.stringify({
  requestId: 'NMbsKcBA64MchrKjQ',
  eventName: 'conversation.created',
  date: '2025-06-11T09:15:09.159Z',
  payload: {
    shopId: 'G4ag3eGyiKibrGcM7',
    conversation: { _id: 'sSzxq7tMBFmCY28o8', channel: 'chat', status: 'open' },
    conversation_item: { _id: 'rxxtPXZng45rALFjE', type: 'message', body: 'test chat' },
  },
});
const closed = JSON.stringify({
  requestId: 'HjheznXCgdmiuSTYa',
  eventName: 'conversation.closed',
  date: '2025-06-11T09:18:14.109Z',
  payload: {
    shopId: 'G4ag3eGyiKibrGcM7',
    conversation: { _id: 'sSzxq7tMBFmCY28o8', channel: 'chat', status: 'open' },
    conversation_item: { _id: '4BJMTqPwP7MDJis6G', type: 'close' },
  },
});
const answered = JSON.stringify({
  requestId: 'call-answered-1',
  eventName: 'call.answered',
  date: '2020-11-12T00:00:00Z',
  payload: { shopId: 'm5phzRDim8GMsdMhP', call: { direction: 'inbound', status: 'answered' } },
});
const unknown = JSON.stringify({ requestId: 'x-1', eventName: 'conversation.snoozed', payload: {} });

function post(body, headers = {}) {
  return request(app).post('/webhooks/belco').set('Content-Type', 'application/json').set(headers).send(body);
}

describe('verifyBelcoSignature', () => {
  it('accepts a valid signature, including uppercase hex', () => {
    expect(verifyBelcoSignature(Buffer.from(created), sign(created), SECRET)).toBe(true);
    expect(verifyBelcoSignature(Buffer.from(created), sign(created).toUpperCase(), SECRET)).toBe(true);
  });
  it('rejects wrong secret, prefix, missing header, bad hex, wrong length', () => {
    expect(verifyBelcoSignature(Buffer.from(created), sign(created, 'other'), SECRET)).toBe(false);
    expect(verifyBelcoSignature(Buffer.from(created), 'sha256=' + sign(created), SECRET)).toBe(false);
    expect(verifyBelcoSignature(Buffer.from(created), undefined, SECRET)).toBe(false);
    expect(verifyBelcoSignature(Buffer.from(created), '', SECRET)).toBe(false);
    expect(verifyBelcoSignature(Buffer.from(created), 'zz'.repeat(32), SECRET)).toBe(false);
    expect(verifyBelcoSignature(Buffer.from(created), 'abcd', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/belco', () => {
  it.each([
    ['conversation.created', created],
    ['conversation.closed', closed],
    ['call.answered', answered],
    ['an unhandled event', unknown],
  ])('accepts a signed %s event', async (_n, body) => {
    const res = await post(body, { 'x-hook-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('verifies any content type over the raw bytes', async () => {
    const res = await request(app)
      .post('/webhooks/belco')
      .set('Content-Type', 'text/plain')
      .set('x-hook-signature', sign(closed))
      .send(closed);
    expect(res.status).toBe(200);
  });

  it('flags a repeated requestId as a duplicate', async () => {
    const body = JSON.stringify({ requestId: 'dup-1', eventName: 'call.closed', payload: { call: {} } });
    const first = await post(body, { 'x-hook-signature': sign(body) });
    const second = await post(body, { 'x-hook-signature': sign(body) });
    expect(first.body).toEqual({ received: true });
    expect(second.body).toEqual({ received: true, duplicate: true });
  });

  it('rejects an unsigned request with 401', async () => {
    expect((await post(created)).status).toBe(401);
  });

  it('rejects a bad signature with 401', async () => {
    expect((await post(created, { 'x-hook-signature': sign(created, 'wrong') })).status).toBe(401);
  });

  it('rejects a malformed signature with 401', async () => {
    expect((await post(created, { 'x-hook-signature': 'abc' })).status).toBe(401);
  });

  it('rejects a tampered body with 401', async () => {
    const res = await post(created.replace('chat', 'mail'), { 'x-hook-signature': sign(created) });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed but malformed JSON body', async () => {
    const bad = '{not json';
    expect((await post(bad, { 'x-hook-signature': sign(bad) })).status).toBe(400);
  });

  it.each(['null', '42', '[1,2]'])('returns 400 for a signed non-object body %s', async (body) => {
    expect((await post(body, { 'x-hook-signature': sign(body) })).status).toBe(400);
  });
});
