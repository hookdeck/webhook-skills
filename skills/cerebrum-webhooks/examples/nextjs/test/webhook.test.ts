import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/cerebrum/route';

// Svix-style secret: 'whsec_' + base64 of the key ("test_secret_key").
const SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5';
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
function payloadFor(event: string, extra: Record<string, unknown> = {}): string {
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
function sign(id: string, timestamp: number, body: string, key: Buffer = KEY): string {
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${sig}`;
}

interface Options {
  prefix?: 'svix' | 'webhook';
  id?: string;
  timestamp?: number;
  signature?: string;
  contentType?: string;
}

function signedRequest(body: string, opts: Options = {}): Request {
  const { prefix = 'svix', id = nextId(), timestamp = nowSeconds(), signature, contentType } = opts;
  return new Request('http://localhost/webhooks/cerebrum', {
    method: 'POST',
    headers: {
      'content-type': contentType ?? 'application/json',
      [`${prefix}-id`]: id,
      [`${prefix}-timestamp`]: String(timestamp),
      [`${prefix}-signature`]: signature ?? sign(id, timestamp, body),
    },
    body,
  });
}

describe('Cerebrum webhook route', () => {
  beforeEach(() => {
    process.env.CEREBRUM_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.CEREBRUM_WEBHOOK_SECRET = SECRET;
  });

  it('accepts a valid delivery signed with svix-* headers', async () => {
    const body = payloadFor('ORDER_STATUS_CHANGE');
    const res = await POST(signedRequest(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts the same delivery sent with webhook-* headers', async () => {
    const body = payloadFor('ORDER_SCORE_CHANGE');
    const res = await POST(signedRequest(body, { prefix: 'webhook' }));
    expect(res.status).toBe(200);
  });

  it.each(EVENTS)('handles %s', async (event) => {
    const res = await POST(signedRequest(payloadFor(event)));
    expect(res.status).toBe(200);
  });

  it('acknowledges an event type it does not know', async () => {
    const res = await POST(signedRequest(payloadFor('SOMETHING_NEW')));
    expect(res.status).toBe(200);
  });

  it('handles an order update with a metadata.delta list', async () => {
    const body = payloadFor('ORDER_STATUS_CHANGE', {
      metadata: { delta: [{ op: 'replace', path: '/status', value: 'COMPLETE' }] },
    });
    const res = await POST(signedRequest(body));
    expect(res.status).toBe(200);
  });

  it('verifies any content type, since the raw bytes are what is signed', async () => {
    const res = await POST(signedRequest(payloadFor('VOUCHER_REDEEMED'), { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('accepts when one of several space-separated signatures is valid', async () => {
    const body = payloadFor('VOUCHER_STARTED');
    const id = nextId();
    const timestamp = nowSeconds();
    const stale = sign(id, timestamp, body, Buffer.from('old_key'));
    const good = sign(id, timestamp, body);
    const res = await POST(signedRequest(body, { id, timestamp, signature: `${stale} ${good}` }));
    expect(res.status).toBe(200);
  });

  it('ignores signature versions other than v1', async () => {
    const body = payloadFor('VOUCHER_STARTED');
    const id = nextId();
    const timestamp = nowSeconds();
    const v1a = sign(id, timestamp, body).replace('v1,', 'v1a,');
    const res = await POST(signedRequest(body, { id, timestamp, signature: v1a }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const req = signedRequest(payloadFor('ORDER_STATUS_CHANGE'));
    const tampered = new Request(req.url, {
      method: 'POST',
      headers: req.headers,
      body: payloadFor('ORDER_SCORE_CHANGE'),
    });
    const res = await POST(tampered);
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong key', async () => {
    const body = payloadFor('ORDER_STATUS_CHANGE');
    const id = nextId();
    const timestamp = nowSeconds();
    const signature = sign(id, timestamp, body, Buffer.from('some_other_key'));
    const res = await POST(signedRequest(body, { id, timestamp, signature }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than the 5-minute window', async () => {
    const res = await POST(
      signedRequest(payloadFor('ORDER_STATUS_CHANGE'), { timestamp: nowSeconds() - 6 * 60 })
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing signature headers', async () => {
    const res = await POST(
      new Request('http://localhost/webhooks/cerebrum', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payloadFor('ORDER_STATUS_CHANGE'),
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects a body that is signed but not JSON', async () => {
    const res = await POST(signedRequest('not json'));
    expect(res.status).toBe(400);
  });

  it('acknowledges a repeated message ID without reprocessing', async () => {
    const body = payloadFor('ORDER_STATUS_CHANGE');
    const id = nextId();
    const timestamp = nowSeconds();
    expect((await POST(signedRequest(body, { id, timestamp }))).status).toBe(200);
    const again = await POST(signedRequest(body, { id, timestamp }));
    expect(again.status).toBe(200);
    expect((await again.json()).duplicate).toBe(true);
  });

  it('fails closed when the secret is not configured', async () => {
    delete process.env.CEREBRUM_WEBHOOK_SECRET;
    const res = await POST(signedRequest(payloadFor('ORDER_STATUS_CHANGE')));
    expect(res.status).toBe(500);
  });
});
