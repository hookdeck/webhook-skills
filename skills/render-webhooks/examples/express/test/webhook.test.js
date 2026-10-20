// Generated with: render-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Standard Webhooks secrets are "whsec_" + base64(key bytes). The HMAC key is
// the base64-DECODED part after "whsec_" (the SDK also accepts it unprefixed).
const SECRET = 'whsec_' + Buffer.from('render-test-signing-key-01234567').toString('base64');

process.env.RENDER_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** Sign exactly like Render (Standard Webhooks). */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

let counter = 0;
const newEventId = () => `evt-test${++counter}${Date.now().toString(36)}`;

/** Render's thin payload. `status` only on *_ended events that carry one. */
function notification(type, { status, id = newEventId() } = {}) {
  const data = { id, serviceId: 'srv-cukouhrtq21c73e9scng', serviceName: 'my-service' };
  if (status) data.status = status;
  return { type, timestamp: '2025-02-25T16:22:19.979294509Z', data };
}

function signedHeaders(rawBody, { id, timestamp, secret, signature } = {}) {
  const msgId = id || JSON.parse(rawBody).data.id;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    'webhook-id': msgId,
    'webhook-timestamp': ts,
    'webhook-signature': signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/render').set(headers).send(rawBody);
}

beforeEach(() => {
  process.env.RENDER_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts deploy_ended with status succeeded', async () => {
    const body = JSON.stringify(notification('deploy_ended', { status: 'succeeded' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Deploy succeeded'));
  });

  it('accepts deploy_ended with status failed', async () => {
    const body = JSON.stringify(notification('deploy_ended', { status: 'failed' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Deploy failed'));
  });

  it.each(['deploy_started', 'build_started', 'server_failed', 'server_available', 'autoscaling_ended'])(
    'accepts %s',
    async (type) => {
      const body = JSON.stringify(notification(type));
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
    }
  );

  it('accepts build_ended with status canceled', async () => {
    const body = JSON.stringify(notification('build_ended', { status: 'canceled' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('canceled'));
  });

  it('accepts an unprefixed base64 secret', async () => {
    process.env.RENDER_WEBHOOK_SECRET = SECRET.replace(/^whsec_/, '');
    const body = JSON.stringify(notification('deploy_started'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(notification('some_future_event'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches', async () => {
    const body = JSON.stringify(notification('deploy_started'));
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a retried delivery of the same event (new timestamp)', async () => {
    const body = JSON.stringify(notification('deploy_ended', { status: 'succeeded' }));
    const first = await post(body, signedHeaders(body));
    const retry = await post(body, signedHeaders(body, { timestamp: now() + 1 }));
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(notification('deploy_started'));
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(notification('deploy_started'));
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const other = 'whsec_' + Buffer.from('some-other-secret-key-0123456789').toString('base64');
    const body = JSON.stringify(notification('deploy_started'));
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(notification('deploy_ended', { status: 'failed' }));
    const headers = signedHeaders(body);
    const res = await post(body.replace('failed', 'succeeded'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(notification('deploy_started'));
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature that appends the secret to the signed string', async () => {
    // Render's docs render the format as "ID.TIMESTAMP.BODY.SECRET", but the
    // secret is the HMAC key, not part of the message.
    const body = JSON.stringify(notification('deploy_started'));
    const id = JSON.parse(body).data.id;
    const ts = String(now());
    const key = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64');
    const wrong = crypto
      .createHmac('sha256', key)
      .update(`${id}.${ts}.${body}.${SECRET}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when RENDER_WEBHOOK_SECRET is not set', async () => {
    delete process.env.RENDER_WEBHOOK_SECRET;
    const body = JSON.stringify(notification('deploy_started'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
