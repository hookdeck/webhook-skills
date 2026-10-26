// Generated with: needle-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Needle secrets look like "whsec_" + base64. The HMAC key is the
// base64-DECODED part after "whsec_".
const SECRET = 'whsec_' + Buffer.from('needle-test-signing-key-0123456789').toString('base64');

process.env.NEEDLE_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** Sign like Standard Webhooks (the scheme Needle uses). */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, { id, timestamp, secret, signature } = {}) {
  const msgId = id || crypto.randomUUID();
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    'webhook-id': msgId,
    'webhook-timestamp': ts,
    'webhook-signature': signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/needle').set(headers).send(rawBody);
}

// Payloads match the body shape in Needle's webhook docs.
const event = (type, overrides = {}, inner = {}) => {
  const id = crypto.randomUUID();
  return {
    version: 'v1',
    id,
    type,
    timestamp: '2026-01-01T12:00:00.000Z',
    data: {
      id,
      type,
      label: 'Example',
      occurredAt: '2026-01-01T12:00:00.000Z',
      channel: 'linkedin',
      nodeId: null,
      leadId: '00000000-0000-0000-0000-000000000002',
      leadName: 'Jane Doe',
      leadEmail: 'jane@example.com',
      campaignId: '00000000-0000-0000-0000-000000000003',
      enrollmentId: '00000000-0000-0000-0000-000000000004',
      connectedAccountId: '00000000-0000-0000-0000-000000000005',
      data: inner,
      ...overrides,
    },
  };
};

beforeEach(() => {
  process.env.NEEDLE_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts lead_created', async () => {
    const body = JSON.stringify(event('lead_created'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Lead created: Jane Doe'));
  });

  it('accepts linkedin_message_received', async () => {
    const body = JSON.stringify(event('linkedin_message_received', {}, { text: 'Hello!' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Hello!'));
  });

  it('accepts enrollment_completed', async () => {
    const body = JSON.stringify(event('enrollment_completed'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('completed in campaign'));
  });

  it('accepts campaign_status_changed and account_disconnected', async () => {
    for (const type of ['campaign_status_changed', 'account_disconnected']) {
      const body = JSON.stringify(event(type));
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
    }
  });

  it('accepts a body sent with a non-JSON content type', async () => {
    const body = JSON.stringify(event('lead_updated'));
    const res = await post(body, { ...signedHeaders(body), 'content-type': 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(event('something_new_from_needle'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unhandled Needle event type'));
  });

  it('accepts when any one of several space-separated signatures matches', async () => {
    const body = JSON.stringify(event('lead_created'));
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,${Buffer.from('bogus').toString('base64')} ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a resend with the same webhook-id', async () => {
    const body = JSON.stringify(event('lead_created'));
    const headers = signedHeaders(body, { id: 'evt-resend-1' });
    expect((await post(body, headers)).status).toBe(200);
    const again = await post(body, headers);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(event('lead_created'));
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(event('lead_created'));
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const body = JSON.stringify(event('lead_created'));
    const other = 'whsec_' + Buffer.from('some-other-signing-key-000000000').toString('base64');
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(event('lead_created'));
    const headers = signedHeaders(body);
    const res = await post(body.replace('Jane Doe', 'Mallory'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(event('lead_created'));
    const res = await post(body, signedHeaders(body, { timestamp: now() - 10 * 60 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(event('lead_created'));
    const id = crypto.randomUUID();
    const ts = String(now());
    const wrong = crypto.createHmac('sha256', SECRET).update(`${id}.${ts}.${body}`).digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when NEEDLE_WEBHOOK_SECRET is not set', async () => {
    delete process.env.NEEDLE_WEBHOOK_SECRET;
    const body = JSON.stringify(event('lead_created'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
