// Generated with: browserbase-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Browserbase secrets are "whsec_" + base64(key bytes).
// The HMAC key is the base64-DECODED part after "whsec_".
const SECRET = 'whsec_' + Buffer.from('browserbase-test-signing-key-012').toString('base64');
const PREVIOUS_SECRET =
  'whsec_' + Buffer.from('browserbase-previous-signing-key').toString('base64');

process.env.BROWSERBASE_WEBHOOK_SECRET = SECRET;
delete process.env.BROWSERBASE_WEBHOOK_SECRET_PREVIOUS;

const { app } = require('../src/index');

/** Sign exactly like Browserbase (Standard Webhooks). */
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
  const msgId = id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    'webhook-id': msgId,
    'webhook-timestamp': ts,
    'webhook-signature': signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/browserbase').set(headers).send(rawBody);
}

function event(type, resourceId = crypto.randomUUID(), data = {}) {
  return { id: crypto.randomUUID(), type, resourceId, data };
}

const invocationCompleted = () =>
  event('functions.invocations.completed', 'a3f1c2d4-7b90-4e51-9c8a-2f6d1e0b4c73');

beforeEach(() => {
  process.env.BROWSERBASE_WEBHOOK_SECRET = SECRET;
  delete process.env.BROWSERBASE_WEBHOOK_SECRET_PREVIOUS;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it.each([
    'functions.invocations.pending',
    'functions.invocations.running',
    'functions.invocations.completed',
    'functions.invocations.failed',
    'functions.builds.running',
    'functions.builds.completed',
    'functions.builds.failed',
  ])('accepts %s', async (type) => {
    const body = JSON.stringify(event(type));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  it('logs the resourceId for functions.invocations.completed', async () => {
    const body = JSON.stringify(invocationCompleted());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(
      'Invocation a3f1c2d4-7b90-4e51-9c8a-2f6d1e0b4c73 completed'
    );
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(event('functions.something.new'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('ignores extra envelope keys', async () => {
    const body = JSON.stringify({ ...invocationCompleted(), newKey: 'value' });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches', async () => {
    const body = JSON.stringify(invocationCompleted());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for redeliveries of the same envelope id', async () => {
    const body = JSON.stringify(invocationCompleted());
    const first = await post(body, signedHeaders(body));
    const second = await post(body, signedHeaders(body));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(invocationCompleted());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(invocationCompleted());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const other = 'whsec_' + Buffer.from('some-other-secret-key-0123456789').toString('base64');
    const body = JSON.stringify(invocationCompleted());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(invocationCompleted());
    const headers = signedHeaders(body);
    const res = await post(body.replace('completed', 'failed'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(invocationCompleted());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(invocationCompleted());
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

describe('secret rotation', () => {
  it('accepts deliveries signed with BROWSERBASE_WEBHOOK_SECRET_PREVIOUS', async () => {
    process.env.BROWSERBASE_WEBHOOK_SECRET_PREVIOUS = PREVIOUS_SECRET;
    const body = JSON.stringify(invocationCompleted());
    const res = await post(body, signedHeaders(body, { secret: PREVIOUS_SECRET }));
    expect(res.status).toBe(200);
  });

  it('rejects the previous secret once it is removed', async () => {
    const body = JSON.stringify(invocationCompleted());
    const res = await post(body, signedHeaders(body, { secret: PREVIOUS_SECRET }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when BROWSERBASE_WEBHOOK_SECRET is not set', async () => {
    delete process.env.BROWSERBASE_WEBHOOK_SECRET;
    const body = JSON.stringify(invocationCompleted());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
