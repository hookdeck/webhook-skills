// Generated with: epilot-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// epilot secrets look like "whsec_" + base64(key bytes), for example
// "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD". The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('epilot-test-signing-key-0123456').toString('base64');

process.env.EPILOT_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** The v1 (symmetric HMAC-SHA256) entry, exactly as epilot signs it. */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

// epilot sends the Ed25519 entry first: "v1a,<asymmetric> v1,<symmetric>".
const V1A = `v1a,${crypto.randomBytes(64).toString('base64')}`;

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, { id, timestamp, secret, signature, prefix = 'webhook' } = {}) {
  const msgId = id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: signature ?? `${V1A} ${sign(rawBody, msgId, ts, secret)}`,
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/epilot').set(headers).send(rawBody);
}

const automationTrigger = () => ({
  metadata: {
    webhook_id: 'wh_123',
    organization_id: '739224',
    event_type: 'automation_trigger_webhook',
    correlation_id: 'c0ffee',
  },
  entity: { _id: 'e1', _schema_: 'opportunity', name: 'New Opportunity', status: 'open' },
  relations: [],
  changed_attributes: { added: {}, deleted: {}, updated: {} },
});

beforeEach(() => {
  process.env.EPILOT_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts automation_trigger_webhook with the v1a + v1 header epilot sends', async () => {
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Automation trigger: opportunity e1'));
  });

  it('accepts customer_request_created', async () => {
    const payload = automationTrigger();
    payload.metadata.event_type = 'customer_request_created';
    const body = JSON.stringify(payload);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Customer request created'));
  });

  it('accepts a FileCreated Event Catalog payload', async () => {
    const body = JSON.stringify({
      _event_name: 'FileCreated',
      _org_id: '739224',
      event_attachments: [{ entity_id: 'f1', filename: 'invoice.pdf', version_index: 0 }],
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('invoice.pdf'));
  });

  it('acknowledges unknown event names with 200', async () => {
    const payload = automationTrigger();
    payload.metadata.event_type = 'event_SomethingNew';
    const body = JSON.stringify(payload);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unhandled epilot event'));
  });

  it('accepts a v1-only signature header', async () => {
    const body = JSON.stringify(automationTrigger());
    const id = 'msg_v1only';
    const ts = String(now());
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: sign(body, id, ts) }));
    expect(res.status).toBe(200);
  });

  it('accepts any of several v1 entries (rotation)', async () => {
    const body = JSON.stringify(automationTrigger());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('verifies any content type, because the raw bytes are what is signed', async () => {
    const body = JSON.stringify(automationTrigger());
    const headers = { ...signedHeaders(body), 'content-type': 'text/plain' };
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, signedHeaders(body, { prefix: 'svix' }));
    expect(res.status).toBe(200);
  });

  it('prefers webhook-* headers when both sets are present', async () => {
    const body = JSON.stringify(automationTrigger());
    const headers = { ...signedHeaders(body), 'svix-id': 'msg_other', 'svix-timestamp': String(now()), 'svix-signature': 'v1,aW52YWxpZA==' };
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a retried delivery with the same webhook-id', async () => {
    const body = JSON.stringify(automationTrigger());
    const id = `msg_retry_${Date.now()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad v1 signature', async () => {
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, signedHeaders(body, { signature: `${V1A} v1,aW52YWxpZA==` }));
    expect(res.status).toBe(400);
  });

  it('rejects a delivery that carries only the v1a signature', async () => {
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, signedHeaders(body, { signature: V1A }));
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another webhook's secret", async () => {
    const other = 'whsec_' + Buffer.from('another-webhook-secret-012345678').toString('base64');
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(automationTrigger());
    const headers = signedHeaders(body);
    const res = await post(body.replace('open', 'won'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the library 5-minute tolerance', async () => {
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(automationTrigger());
    const id = 'msg_undecoded';
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.slice('whsec_'.length))
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });
});

describe('other HTTP methods', () => {
  it.each(['PUT', 'PATCH', 'DELETE'])('verifies and handles %s', async (method) => {
    const body = JSON.stringify(automationTrigger());
    const ok = await request(app)[method.toLowerCase()]('/webhooks/epilot').set(signedHeaders(body)).send(body);
    expect(ok.status).toBe(200);
    const bad = await request(app)[method.toLowerCase()]('/webhooks/epilot')
      .set(signedHeaders(body, { secret: 'whsec_' + Buffer.from('another-webhook-key').toString('base64') }))
      .send(body);
    expect(bad.status).toBe(400);
  });

  it('verifies a GET with no body over zero bytes', async () => {
    const ok = await request(app).get('/webhooks/epilot').set(signedHeaders(''));
    expect(ok.status).toBe(200);
    const bad = await request(app).get('/webhooks/epilot').set(signedHeaders('x'));
    expect(bad.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when EPILOT_WEBHOOK_SECRET is not set', async () => {
    delete process.env.EPILOT_WEBHOOK_SECRET;
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
