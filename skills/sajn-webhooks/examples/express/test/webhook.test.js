// Generated with: sajn-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// sajn secrets look like "whsec_" + base64(key bytes). The HMAC key is the
// decoded part. This is the secret sajn's own test-request script uses.
const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';

process.env.SAJN_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** Sign exactly like sajn does: base64(HMAC-SHA256(key, "{id}.{timestamp}.{body}")). */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

/** Headers for a delivery. `prefix` is 'webhook' (sajn) or 'svix' (fallback). */
function signedHeaders(rawBody, { id, timestamp, secret, signature, prefix = 'webhook' } = {}) {
  const msgId = id || `cm${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/sajn').set(headers).send(rawBody);
}

const event = (type, data, id) => ({
  id: id || `cm${crypto.randomUUID().replace(/-/g, '')}`,
  type,
  createdAt: '2026-10-01T09:30:00.000Z',
  apiVersion: '2026-10',
  workspaceId: 'cm4k2x9p10001abcd1234efgh',
  environment: 'PRODUCTION',
  actor: null,
  data,
});

const documentCompleted = () =>
  event('document.completed', {
    object: {
      id: 'cm4k2x9p10003abcd1234efgh',
      name: 'Anställningsavtal – Kai Lindqvist',
      status: 'COMPLETED',
      completedAt: '2026-10-01T09:30:00.000Z',
    },
  });

beforeEach(() => {
  process.env.SAJN_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts document.completed', async () => {
    const body = JSON.stringify(documentCompleted());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Document completed'));
  });

  it('accepts document.fully_signed', async () => {
    const body = JSON.stringify(
      event('document.fully_signed', { object: { id: 'cm4k2x9p10003abcd1234efgh', status: 'PENDING' } })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('fully signed'));
  });

  it('accepts document.party.signed', async () => {
    const body = JSON.stringify(
      event('document.party.signed', {
        object: { id: 'cm4k2x9p10003abcd1234efgh' },
        party: { id: 'cm4k2x9p10004abcd1234efgh', signingStatus: 'SIGNED' },
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Party cm4k2x9p10004abcd1234efgh signed'));
  });

  it('accepts document.party.delivery_failed', async () => {
    const body = JSON.stringify(
      event('document.party.delivery_failed', {
        object: { id: 'cm4k2x9p10003abcd1234efgh' },
        party: { id: 'cm4k2x9p10004abcd1234efgh' },
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Invitation to party'));
  });

  it('accepts identity_check.failed', async () => {
    const body = JSON.stringify(
      event('identity_check.failed', { object: { id: 'ic_1' }, failureReason: 'EXPIRED' })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('EXPIRED'));
  });

  it('accepts webhook.test', async () => {
    const body = JSON.stringify(
      event('webhook.test', { object: { id: 'cm4k2x9p10013abcd1234efgh', url: 'https://example.com/webhooks/sajn' } })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(event('document.something_new', { object: {} }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('verifies any content type (raw body is read for */*)', async () => {
    const body = JSON.stringify(documentCompleted());
    const headers = { ...signedHeaders(body), 'content-type': 'application/cloudevents+json' };
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches (rotation)', async () => {
    const body = JSON.stringify(documentCompleted());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('ignores other signature versions such as v1a', async () => {
    const body = JSON.stringify(documentCompleted());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1a,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 and skips a retried delivery with the same event id', async () => {
    const body = JSON.stringify(documentCompleted());
    const first = await post(body, signedHeaders(body));
    // A retry carries the same id and body but a new timestamp and signature.
    const second = await post(body, signedHeaders(body, { id: JSON.parse(body).id, timestamp: now() + 1 }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });
});

describe('svix-* header fallback', () => {
  it('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const body = JSON.stringify(documentCompleted());
    const res = await post(body, signedHeaders(body, { prefix: 'svix' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a bad signature sent with svix-* headers', async () => {
    const body = JSON.stringify(documentCompleted());
    const res = await post(body, signedHeaders(body, { prefix: 'svix', signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('prefers webhook-* headers when webhook-id is present', async () => {
    const body = JSON.stringify(documentCompleted());
    const headers = {
      ...signedHeaders(body),
      'svix-id': 'ignored',
      'svix-timestamp': '1',
      'svix-signature': 'v1,aW52YWxpZA==',
    };
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(documentCompleted());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('answers the unsigned dashboard save check with 400 JSON', async () => {
    const res = await post('{"test":true}', {
      'content-type': 'application/json',
      'user-agent': 'sajn-webhook-validator/1.0',
    });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('points a 2026-09 endpoint (X-Sajn-Signature) at API version 2026-10', async () => {
    const body = JSON.stringify({ event: 'DOCUMENT_COMPLETED', payload: {}, apiVersion: '2026-09' });
    const res = await post(body, { 'content-type': 'application/json', 'x-sajn-signature': 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('API version 2026-10');
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(documentCompleted());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another endpoint's secret", async () => {
    const other = 'whsec_' + Buffer.from('another-endpoint-secret-01234567').toString('base64');
    const body = JSON.stringify(documentCompleted());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(documentCompleted());
    const headers = signedHeaders(body);
    const res = await post(body.replace('COMPLETED', 'DRAFT'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(documentCompleted());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(documentCompleted());
    const id = 'cm_undecoded';
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.slice('whsec_'.length))
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when SAJN_WEBHOOK_SECRET is not set', async () => {
    delete process.env.SAJN_WEBHOOK_SECRET;
    const body = JSON.stringify(documentCompleted());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
