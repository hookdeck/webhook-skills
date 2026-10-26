const crypto = require('crypto');
const request = require('supertest');

// Set test environment variables before importing the app
process.env.ARGYLE_WEBHOOK_SECRET = 'test_argyle_subscription_secret';

const app = require('../src/index');
const { verifyArgyleSignature } = require('../src/index');

const SECRET = process.env.ARGYLE_WEBHOOK_SECRET;
const PATH = '/webhooks/argyle';
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// Payloads follow the documented sample (event, name, data with ids).
const PAYLOADS = {
  'accounts.connected': {
    event: 'accounts.connected',
    name: 'name-for-the-webhook-subscription',
    data: { account: '0187c66e-e7e5-811c-b006-2232f00f426a', user: '018051aa-f7a9-a0db-2f38-6cfa325e9d69' },
  },
  'gigs.fully_synced': {
    event: 'gigs.fully_synced',
    name: 'name-for-the-webhook-subscription',
    data: { account: '0187c66e-e7e5-811c-b006-2232f00f426a', user: '018051aa-f7a9-a0db-2f38-6cfa325e9d69' },
  },
  'identities.updated': {
    event: 'identities.updated',
    name: 'name-for-the-webhook-subscription',
    data: { account: '0187c66e-e7e5-811c-b006-2232f00f426a', user: '018051aa-f7a9-a0db-2f38-6cfa325e9d69' },
  },
  'items.removed': {
    event: 'items.removed',
    name: 'name-for-the-webhook-subscription',
    data: { items: ['item_000000001'] },
  },
};

// HMAC-SHA512 over the raw body bytes, bare hex digest, no prefix.
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

function send(method, body, headers = {}) {
  let req = request(app)[method](PATH);
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  return body === undefined ? req.send() : req.send(body);
}

describe('Argyle webhook verification', () => {
  describe.each(Object.entries(PAYLOADS))('%s', (name, payload) => {
    it('accepts a validly signed event', async () => {
      const body = JSON.stringify(payload);
      const res = await send('post', body, {
        'Content-Type': 'application/json',
        'X-Argyle-Signature': sign(body),
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });
  });

  it.each(METHODS)('accepts a signed %s request', async (method) => {
    const body = JSON.stringify(PAYLOADS['accounts.connected']);
    const res = await send(method, body, {
      'Content-Type': 'application/json',
      'X-Argyle-Signature': sign(body),
    });
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, whatever the content type', async () => {
    const body = '{"event": "accounts.connected",  "data": {}}'; // unusual spacing must survive
    const res = await send('post', body, {
      'Content-Type': 'text/plain',
      'X-Argyle-Signature': sign(body),
    });
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    const body = JSON.stringify(PAYLOADS['accounts.connected']);
    const res = await send('post', body, {
      'Content-Type': 'application/json',
      'X-Argyle-Signature': sign(body).toUpperCase(),
    });
    expect(res.status).toBe(200);
  });

  it('verifies a GET with no body over zero bytes and acknowledges it with 200', async () => {
    const res = await send('get', undefined, { 'X-Argyle-Signature': sign('') });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects an unsigned GET with 401', async () => {
    const res = await send('get', undefined);
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    const res = await send('post', JSON.stringify(PAYLOADS['accounts.connected']), {
      'Content-Type': 'application/json',
    });
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    const res = await send('post', '{}', { 'Content-Type': 'application/json', 'X-Argyle-Signature': '' });
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(PAYLOADS['accounts.connected']);
    const res = await send('post', body, {
      'Content-Type': 'application/json',
      'X-Argyle-Signature': sign(body, 'another_secret'),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(PAYLOADS['accounts.connected']);
    const res = await send('post', body.replace('accounts', 'accountz'), {
      'Content-Type': 'application/json',
      'X-Argyle-Signature': sign(body),
    });
    expect(res.status).toBe(401);
  });

  it('rejects malformed signatures (length, alphabet, prefix, trailing junk)', async () => {
    const body = JSON.stringify(PAYLOADS['accounts.connected']);
    const good = sign(body);
    const bad = [good.slice(0, -2), good + 'ab', good.slice(0, -1) + 'g', 'sha512=' + good, good + 'zz'];
    for (const signature of bad) {
      const res = await send('post', body, { 'Content-Type': 'application/json', 'X-Argyle-Signature': signature });
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await send('post', body, { 'Content-Type': 'text/plain', 'X-Argyle-Signature': sign(body) });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed JSON body that is not an object', async () => {
    const body = '[1,2]';
    const res = await send('post', body, {
      'Content-Type': 'application/json',
      'X-Argyle-Signature': sign(body),
    });
    expect(res.status).toBe(400);
  });

  it('acknowledges an event it does not handle', async () => {
    const body = JSON.stringify({ event: 'example.unhandled', name: 'n', data: {} });
    const res = await send('post', body, { 'Content-Type': 'application/json', 'X-Argyle-Signature': sign(body) });
    expect(res.status).toBe(200);
  });
});

describe('verifyArgyleSignature', () => {
  const raw = Buffer.from('{"event":"accounts.connected"}');

  it('accepts a Buffer body and rejects when the secret is unset', () => {
    expect(verifyArgyleSignature(raw, sign(raw), SECRET)).toBe(true);
    expect(verifyArgyleSignature(raw, sign(raw), '')).toBe(false);
  });

  it('rejects non-string signatures', () => {
    expect(verifyArgyleSignature(raw, undefined, SECRET)).toBe(false);
    expect(verifyArgyleSignature(raw, ['x'], SECRET)).toBe(false);
  });
});
