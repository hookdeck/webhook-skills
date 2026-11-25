// Generated with: worldline-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic webhooks keys. Real ones come from the Connect Configuration Center
// ("webhooks keys") or the Direct Merchant Portal (Developer > Webhooks).
const KEY_ID = 'test-webhooks-key-id-new';
const SECRET = 'test-webhooks-secret-key-new';
const OLD_KEY_ID = 'test-webhooks-key-id-old';
const OLD_SECRET = 'test-webhooks-secret-key-old';

const {
  app,
  verifyWorldlineSignature,
  resourceKeyFor,
  processEvent,
  CONNECT_EVENTS,
  DIRECT_EVENTS,
  seenEventIds,
  setEnqueue,
} = require('../src/index');

// Envelope from the Connect event-structure page; payment fields from the docs sample.
const makeEvent = (overrides = {}) => ({
  apiVersion: 'v1',
  id: crypto.randomUUID(),
  created: '2017-09-14T17:14:39.688+0200',
  merchantId: '20000',
  type: 'payment.created',
  payment: {
    id: '000000200000000105460000100001',
    paymentOutput: {
      amountOfMoney: { amount: 1000, currencyCode: 'EUR' },
      references: { paymentReference: '0' },
      paymentMethod: 'card',
    },
    status: 'CREATED',
    statusOutput: { isCancellable: true, statusCategory: 'CREATED', statusCode: 0, isAuthorized: false },
  },
  ...overrides,
});
const makeBody = (overrides) => JSON.stringify(makeEvent(overrides));

const sign = (body, secret = SECRET) => crypto.createHmac('sha256', secret).update(body).digest('base64');

const post = (body, { signature, keyId = KEY_ID, headers = {} } = {}) => {
  const req = request(app).post('/webhooks/worldline').set('Content-Type', 'application/json');
  if (signature !== null) req.set('X-GCS-Signature', signature === undefined ? sign(body) : signature);
  if (keyId !== null) req.set('X-GCS-KeyId', keyId);
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  return req.send(body);
};

let queued;

beforeEach(() => {
  process.env.WORLDLINE_WEBHOOK_KEY_ID = KEY_ID;
  process.env.WORLDLINE_WEBHOOK_SECRET = SECRET;
  delete process.env.WORLDLINE_WEBHOOK_KEY_ID_PREVIOUS;
  delete process.env.WORLDLINE_WEBHOOK_SECRET_PREVIOUS;
  delete process.env.WORLDLINE_CUSTOM_HEADER_NAME;
  delete process.env.WORLDLINE_CUSTOM_HEADER_VALUE;
  seenEventIds.clear();
  queued = [];
  setEnqueue((event) => queued.push(event));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyWorldlineSignature', () => {
  const body = makeBody();

  it('accepts base64 HMAC-SHA256 of the raw body', () => {
    expect(verifyWorldlineSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a hex digest: Worldline sends base64', () => {
    const hex = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifyWorldlineSignature(body, hex, SECRET)).toBe(false);
  });

  it('rejects a signature over re-serialised JSON', () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyWorldlineSignature(body, sign(pretty), SECRET)).toBe(false);
  });

  it('rejects a truncated signature without throwing', () => {
    expect(verifyWorldlineSignature(body, sign(body).slice(0, 20), SECRET)).toBe(false);
  });

  it('signs the empty string too (the Direct ValidateWebhookCredentials self-test)', () => {
    expect(verifyWorldlineSignature('', sign(''), SECRET)).toBe(true);
  });
});

describe('GET /webhooks/worldline (Connect endpoint verification)', () => {
  it('echoes X-GCS-Webhooks-Endpoint-Verification as the plain-text body', async () => {
    const res = await request(app)
      .get('/webhooks/worldline')
      .set('X-GCS-Webhooks-Endpoint-Verification', 'r4nd0m-Str1ng');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.text).toBe('r4nd0m-Str1ng');
  });

  it('needs no signature or secret', async () => {
    delete process.env.WORLDLINE_WEBHOOK_SECRET;
    const res = await request(app).get('/webhooks/worldline').set('X-GCS-Webhooks-Endpoint-Verification', 'abc');
    expect(res.status).toBe(200);
    expect(res.text).toBe('abc');
  });

  it('returns 400 without the header', async () => {
    expect((await request(app).get('/webhooks/worldline')).status).toBe(400);
  });
});

describe('POST /webhooks/worldline', () => {
  it('accepts a valid signature and queues the event', async () => {
    const body = makeBody();
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, id: JSON.parse(body).id, type: 'payment.created' });
    expect(queued).toHaveLength(1);
    expect(queued[0].payment.paymentOutput.amountOfMoney).toEqual({ amount: 1000, currencyCode: 'EUR' });
  });

  it('verifies the raw bytes of a pretty-printed body', async () => {
    const body = JSON.stringify(makeEvent(), null, 2);
    expect((await post(body)).status).toBe(200);
  });

  it('accepts every documented Connect event (56 + payment.paid_increment)', async () => {
    expect(CONNECT_EVENTS.size).toBe(57);
    for (const type of CONNECT_EVENTS) {
      const res = await post(makeBody({ type }));
      expect(res.status).toBe(200);
      expect(res.body.type).toBe(type);
    }
    expect(queued).toHaveLength(57);
  });

  it('accepts every documented Direct event', async () => {
    expect(DIRECT_EVENTS.size).toBe(20);
    for (const type of DIRECT_EVENTS) {
      const res = await post(makeBody({ type, merchantId: 'TESTCIMCREDITCARDS' }));
      expect(res.status).toBe(200);
      expect(res.body.type).toBe(type);
    }
  });

  it('accepts a message signed with the older key during a rotation', async () => {
    process.env.WORLDLINE_WEBHOOK_KEY_ID_PREVIOUS = OLD_KEY_ID;
    process.env.WORLDLINE_WEBHOOK_SECRET_PREVIOUS = OLD_SECRET;
    const body = makeBody();
    expect((await post(body, { signature: sign(body, OLD_SECRET), keyId: OLD_KEY_ID })).status).toBe(200);
  });

  it('rejects an unknown X-GCS-KeyId even when the signature matches the configured secret', async () => {
    const body = makeBody();
    const res = await post(body, { keyId: 'some-other-key' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unknown key id');
  });

  it('rejects a signature made with the other key\'s secret', async () => {
    process.env.WORLDLINE_WEBHOOK_KEY_ID_PREVIOUS = OLD_KEY_ID;
    process.env.WORLDLINE_WEBHOOK_SECRET_PREVIOUS = OLD_SECRET;
    const body = makeBody();
    expect((await post(body, { signature: sign(body, OLD_SECRET), keyId: KEY_ID })).status).toBe(401);
  });

  it('rejects a missing X-GCS-Signature or X-GCS-KeyId with 401', async () => {
    const body = makeBody();
    expect((await post(body, { signature: null })).status).toBe(401);
    expect((await post(body, { keyId: null })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = makeBody();
    const tampered = body.replace('"amount":1000', '"amount":1');
    expect((await post(tampered, { signature: sign(body) })).status).toBe(401);
  });

  it('rejects a malformed signature with 401, not 500', async () => {
    expect((await post(makeBody(), { signature: 'abc' })).status).toBe(401);
  });

  it('fails closed with 401 when the secret is not set', async () => {
    delete process.env.WORLDLINE_WEBHOOK_SECRET;
    const res = await post(makeBody());
    expect(res.status).toBe(401);
    expect(queued).toHaveLength(0);
  });

  it('returns 400 for a correctly signed empty body', async () => {
    const res = await request(app)
      .post('/webhooks/worldline')
      .set('X-GCS-Signature', sign(''))
      .set('X-GCS-KeyId', KEY_ID);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    expect((await post('{"truncated": ')).status).toBe(400);
  });

  it('unwraps a one-element array (Direct docs rendering)', async () => {
    const body = JSON.stringify([makeEvent()]);
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(queued).toHaveLength(1);
  });

  it('logs and accepts an unexpected apiVersion', async () => {
    const res = await post(makeBody({ apiVersion: 'v2' }));
    expect(res.status).toBe(200);
    expect(queued).toHaveLength(1);
    expect(console.warn).toHaveBeenCalled();
  });

  it('dedupes a redelivered event on id, whatever retry-count says', async () => {
    const body = makeBody();
    await post(body, { headers: { 'retry-count': '0' } });
    const res = await post(body, { headers: { 'retry-count': '1' } });
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(queued).toHaveLength(1);
  });

  it('acknowledges but does not process a TEST-prefixed id', async () => {
    const res = await post(makeBody({ id: 'TEST97a4fcdf-9a08-4a59-a0c0-69bfd7e1d59d' }));
    expect(res.status).toBe(200);
    expect(res.body.test).toBe(true);
    expect(queued).toHaveLength(0);
  });

  it('returns 200 and ignores an unknown type', async () => {
    const res = await post(makeBody({ type: 'payment.some_future_event' }));
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe('unknown type');
    expect(queued).toHaveLength(0);
  });

  it('checks the optional custom header in addition to the HMAC', async () => {
    process.env.WORLDLINE_CUSTOM_HEADER_NAME = 'X-My-Webhook-Token';
    process.env.WORLDLINE_CUSTOM_HEADER_VALUE = 'shared-token-value';
    const body = makeBody();
    expect((await post(body)).status).toBe(401);
    expect((await post(body, { headers: { 'X-My-Webhook-Token': 'wrong' } })).status).toBe(401);
    const ok = await post(makeBody(), { headers: { 'X-My-Webhook-Token': 'shared-token-value' } });
    expect(ok.status).toBe(200);
  });
});

describe('resourceKeyFor', () => {
  it.each([
    ['payment.created', 'payment'],
    ['refund.refunded', 'refund'],
    ['capture.paid', 'capture'],
    ['dispute.created', 'dispute'],
    ['paymentlink.created', 'paymentLink'],
    ['paymentlink.payment.rejected', 'paymentLink'],
    ['unknownobject.created', undefined],
  ])('%s -> %s', (type, key) => {
    expect(resourceKeyFor(type)).toBe(key);
  });
});

describe('processEvent', () => {
  it('reads the Direct paymentLink key for a three-segment type', async () => {
    const summary = await processEvent({
      apiVersion: 'v1',
      id: 'e1',
      type: 'paymentlink.payment.rejected',
      merchantId: 'TESTCIMCREDITCARDS',
      paymentLink: { id: 'pl_1', status: 'CANCELLED' },
    });
    expect(summary.resourceId).toBe('pl_1');
  });

  it('handles token.deleted carrying only an id', async () => {
    const summary = await processEvent({ apiVersion: 'v1', id: 'e2', type: 'token.deleted', token: { id: 'tok_1' } });
    expect(summary.resourceId).toBe('tok_1');
  });

  it('extracts merchantReference for correlation', async () => {
    const event = makeEvent();
    event.payment.paymentOutput.references.merchantReference = 'order-42';
    expect((await processEvent(event)).merchantReference).toBe('order-42');
  });
});
