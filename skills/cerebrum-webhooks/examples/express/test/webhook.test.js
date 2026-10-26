import crypto from 'node:crypto';
import request from 'supertest';

// Svix-style secret: 'whsec_' + base64 of the key ("test_secret_key").
const SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5';
process.env.CEREBRUM_WEBHOOK_SECRET = SECRET;

const { app, getSignatureHeaders, verifyCerebrumWebhook } = await import('../src/index.js');

const KEY = Buffer.from(SECRET.slice('whsec_'.length), 'base64');
const EVENTS = [
  'ORDER_STATUS_CHANGE',
  'ORDER_SCORE_CHANGE',
  'ORDER_CUSTOM_SCORE_CHANGE',
  'ORDER_DISPUTE_RESOLVED',
  'VOUCHER_STARTED',
  'VOUCHER_REDEEMED',
  'VOUCHER_EXPIRED',
  'MONITORING_REPORT_GENERATED',
  'BEAM_INPUT_CREATED',
];

// Payload shape from Cerebrum's JSON Schema; the values are made up for tests.
function payloadFor(event, extra = {}) {
  return JSON.stringify({
    id: 'ord_test_123',
    idType: 'ORDER',
    additionalMetadata: {},
    event,
    eventDate: '2026-10-26T12:00:00.000Z',
    svixAppId: 'app_test',
    metadata: {},
    ...extra,
  });
}

let counter = 0;
const nextId = () => `msg_test_${Date.now()}_${counter++}`;
const nowSeconds = () => Math.floor(Date.now() / 1000);

// Same algorithm as Svix: base64(HMAC-SHA256(key, `${id}.${timestamp}.${body}`)).
function sign(id, timestamp, body, key = KEY) {
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${sig}`;
}

function headersFor(body, { prefix = 'svix', id = nextId(), timestamp = nowSeconds(), signature } = {}) {
  return {
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: String(timestamp),
    [`${prefix}-signature`]: signature ?? sign(id, timestamp, body),
    'content-type': 'application/json',
  };
}

function post(body, headers) {
  return request(app).post('/webhooks/cerebrum').set(headers).send(body);
}

describe('Cerebrum webhook endpoint', () => {
  afterEach(() => {
    process.env.CEREBRUM_WEBHOOK_SECRET = SECRET;
  });

  it('accepts a valid delivery signed with svix-* headers', async () => {
    const body = payloadFor('ORDER_STATUS_CHANGE');
    const res = await post(body, headersFor(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts the same delivery sent with webhook-* headers', async () => {
    const body = payloadFor('ORDER_SCORE_CHANGE');
    const res = await post(body, headersFor(body, { prefix: 'webhook' }));
    expect(res.status).toBe(200);
  });

  it.each(EVENTS)('handles %s', async (event) => {
    const body = payloadFor(event);
    const res = await post(body, headersFor(body));
    expect(res.status).toBe(200);
  });

  it('acknowledges an event type it does not know', async () => {
    const body = payloadFor('SOMETHING_NEW');
    const res = await post(body, headersFor(body));
    expect(res.status).toBe(200);
  });

  it('handles an order update with a metadata.delta list', async () => {
    const body = payloadFor('ORDER_STATUS_CHANGE', {
      metadata: { delta: [{ op: 'replace', path: '/status', value: 'COMPLETE' }] },
    });
    const res = await post(body, headersFor(body));
    expect(res.status).toBe(200);
  });

  it('verifies any content type, since the raw bytes are what is signed', async () => {
    const body = payloadFor('VOUCHER_REDEEMED');
    const res = await post(body, { ...headersFor(body), 'content-type': 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('accepts when one of several space-separated signatures is valid', async () => {
    const body = payloadFor('VOUCHER_STARTED');
    const id = nextId();
    const timestamp = nowSeconds();
    const good = sign(id, timestamp, body);
    const stale = sign(id, timestamp, body, Buffer.from('old_key'));
    const res = await post(body, headersFor(body, { id, timestamp, signature: `${stale} ${good}` }));
    expect(res.status).toBe(200);
  });

  it('ignores signature versions other than v1', async () => {
    const body = payloadFor('VOUCHER_STARTED');
    const id = nextId();
    const timestamp = nowSeconds();
    const v1a = sign(id, timestamp, body).replace('v1,', 'v1a,');
    const res = await post(body, headersFor(body, { id, timestamp, signature: v1a }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = payloadFor('ORDER_STATUS_CHANGE');
    const headers = headersFor(body);
    const res = await post(payloadFor('ORDER_SCORE_CHANGE'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong key', async () => {
    const body = payloadFor('ORDER_STATUS_CHANGE');
    const id = nextId();
    const timestamp = nowSeconds();
    const signature = sign(id, timestamp, body, Buffer.from('some_other_key'));
    const res = await post(body, headersFor(body, { id, timestamp, signature }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than the 5-minute window', async () => {
    const body = payloadFor('ORDER_STATUS_CHANGE');
    const res = await post(body, headersFor(body, { timestamp: nowSeconds() - 6 * 60 }));
    expect(res.status).toBe(400);
  });

  it('rejects missing signature headers', async () => {
    const body = payloadFor('ORDER_STATUS_CHANGE');
    const res = await request(app).post('/webhooks/cerebrum').set('content-type', 'application/json').send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a body that is signed but not JSON', async () => {
    const body = 'not json';
    const res = await post(body, headersFor(body));
    expect(res.status).toBe(400);
  });

  it('acknowledges a repeated message ID without reprocessing', async () => {
    const body = payloadFor('ORDER_STATUS_CHANGE');
    const headers = headersFor(body);
    expect((await post(body, headers)).status).toBe(200);
    const again = await post(body, headers);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
  });

  it('fails closed when the secret is not configured', async () => {
    delete process.env.CEREBRUM_WEBHOOK_SECRET;
    const body = payloadFor('ORDER_STATUS_CHANGE');
    const res = await post(body, headersFor(body));
    expect(res.status).toBe(500);
  });
});

describe('getSignatureHeaders', () => {
  const lookup = (headers) => (name) => headers[name];

  it('prefers svix-* when svix-id is present', () => {
    const got = getSignatureHeaders(
      lookup({ 'svix-id': 'a', 'svix-timestamp': '1', 'svix-signature': 'v1,x', 'webhook-id': 'b' })
    );
    expect(got['svix-id']).toBe('a');
  });

  it('falls back to webhook-* when svix-id is absent', () => {
    const got = getSignatureHeaders(
      lookup({ 'webhook-id': 'b', 'webhook-timestamp': '2', 'webhook-signature': 'v1,y' })
    );
    expect(got).toEqual({ 'svix-id': 'b', 'svix-timestamp': '2', 'svix-signature': 'v1,y' });
  });

  it('returns null when a header from the chosen set is missing', () => {
    expect(getSignatureHeaders(lookup({ 'svix-id': 'a', 'webhook-timestamp': '2' }))).toBeNull();
  });
});

describe('verifyCerebrumWebhook', () => {
  it('returns the parsed payload', () => {
    const body = payloadFor('BEAM_INPUT_CREATED');
    const id = nextId();
    const timestamp = nowSeconds();
    const headers = {
      'svix-id': id,
      'svix-timestamp': String(timestamp),
      'svix-signature': sign(id, timestamp, body),
    };
    expect(verifyCerebrumWebhook(body, headers, SECRET).event).toBe('BEAM_INPUT_CREATED');
  });
});
