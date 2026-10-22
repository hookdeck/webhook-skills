const request = require('supertest');
const crypto = require('crypto');

// Exa returns the secret as an opaque string on webhook creation; this one is only for tests
const SECRET = 'test_exa_webhook_secret_5c1f';
process.env.EXA_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

function sig(body, timestamp = Math.floor(Date.now() / 1000), secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function header(body, timestamp = Math.floor(Date.now() / 1000), secret = SECRET) {
  return `t=${timestamp},v1=${sig(body, timestamp, secret)}`;
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/exa').set('Content-Type', contentType);
  if (signature) req.set('Exa-Signature', signature);
  return req.send(body);
}

const itemCreated = JSON.stringify({
  id: 'evt_1',
  object: 'event',
  type: 'webset.item.created',
  data: { id: 'item_1', object: 'webset_item' },
  createdAt: '2026-01-01T00:00:00Z',
});

describe('Exa webhook', () => {
  it('accepts a valid signature', async () => {
    const res = await post(itemCreated, header(itemCreated));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each([
    'webset.created',
    'webset.idle',
    'webset.search.completed',
    'webset.item.enriched',
  ])('handles %s', async (type) => {
    const body = JSON.stringify({ id: 'evt_2', type, data: { id: 'x' } });
    const res = await post(body, header(body));
    expect(res.status).toBe(200);
  });

  it('accepts unknown event types', async () => {
    const body = JSON.stringify({ id: 'evt_3', type: 'monitor.run.completed', data: {} });
    const res = await post(body, header(body));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const res = await post(itemCreated, header(itemCreated), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('accepts when any of several v1 signatures matches', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const h = `t=${ts},v1=${sig(itemCreated, ts, 'old_secret')},v1=${sig(itemCreated, ts)}`;
    const res = await post(itemCreated, h);
    expect(res.status).toBe(200);
  });

  it('rejects a missing header', async () => {
    const res = await post(itemCreated);
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await post(itemCreated.replace('item_1', 'item_2'), header(itemCreated));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await post(itemCreated, header(itemCreated, undefined, 'other_secret'));
    expect(res.status).toBe(400);
  });

  it('rejects a signature of a different length without throwing', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await post(itemCreated, `t=${ts},v1=abcd`);
    expect(res.status).toBe(400);
  });

  it('rejects a header without a timestamp', async () => {
    const res = await post(itemCreated, `v1=${sig(itemCreated, 123)}`);
    expect(res.status).toBe(400);
  });

  it('rejects a header without v1', async () => {
    const res = await post(itemCreated, `t=${Math.floor(Date.now() / 1000)}`);
    expect(res.status).toBe(400);
  });

  it('rejects a tampered timestamp', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await post(itemCreated, `t=${ts + 1},v1=${sig(itemCreated, ts)}`);
    expect(res.status).toBe(400);
  });

  it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const res = await post(itemCreated, header(itemCreated, old));
    expect(res.status).toBe(200);
  });

  it('rejects an old timestamp when EXA_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.EXA_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      const stale = await post(itemCreated, header(itemCreated, old));
      expect(stale.status).toBe(400);
      const fresh = await post(itemCreated, header(itemCreated));
      expect(fresh.status).toBe(200);
    } finally {
      delete process.env.EXA_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('rejects a valid signature over invalid JSON with 400', async () => {
    const body = 'not json';
    const res = await post(body, header(body));
    expect(res.status).toBe(400);
  });
});
