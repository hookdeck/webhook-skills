// Generated with: scalekit-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// scalekit secrets look like "whsec_" + base64(key bytes). The HMAC key is the
// decoded part. Scalekit shows the full whsec_ value on the endpoint page.
const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';

process.env.SCALEKIT_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** Sign exactly like scalekit does: base64(HMAC-SHA256(key, "{id}.{timestamp}.{body}")). */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

/** Headers for a delivery. `prefix` is 'webhook' (scalekit) or 'svix' (fallback). */
function signedHeaders(rawBody, { id, timestamp, secret, signature, prefix = 'webhook' } = {}) {
  const msgId = id || `evt_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/scalekit').set(headers).send(rawBody);
}

const event = (type, data, id) => ({
  spec_version: '1',
  id: id || `evt_${crypto.randomUUID().replace(/-/g, '')}`,
  environment_id: 'env_100000000000000001',
  occurred_at: '2026-10-01T09:30:00.000Z',
  organization_id: 'org_100000000000000001',
  type,
  data,
});

const directoryUserCreated = () => ({
  ...event('organization.directory.user_created', {
    id: 'diruser_100000000000000001',
    organization_id: 'org_100000000000000001',
    email: 'kai@example.com',
    given_name: 'Kai',
    family_name: 'Lindqvist',
    active: true,
    groups: [],
    roles: [],
  }),
  object: 'DirectoryUser',
});

beforeEach(() => {
  process.env.SCALEKIT_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts organization.directory.user_created', async () => {
    const body = JSON.stringify(directoryUserCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('kai@example.com'));
  });

  it('accepts organization.created', async () => {
    const body = JSON.stringify(event('organization.created', { id: 'org_1', display_name: 'Acme' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('organization.created: org_1 (Acme)'));
  });

  it('accepts organization.directory.group_updated', async () => {
    const body = JSON.stringify(event('organization.directory.group_updated', { id: 'dirgroup_1', display_name: 'Engineering' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Engineering'));
  });

  it('accepts user.login (no organization_id)', async () => {
    const { organization_id, ...rest } = event('user.login', { id: 'usr_1' });
    const body = JSON.stringify(rest);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('user.login: usr_1'));
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(event('organization.something_new', {}));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('verifies any content type (raw body is read for */*)', async () => {
    const body = JSON.stringify(directoryUserCreated());
    const headers = { ...signedHeaders(body), 'content-type': 'application/cloudevents+json' };
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches (rotation)', async () => {
    const body = JSON.stringify(directoryUserCreated());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('ignores other signature versions such as v1a', async () => {
    const body = JSON.stringify(directoryUserCreated());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1a,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 and skips a retried delivery with the same event id', async () => {
    const body = JSON.stringify(directoryUserCreated());
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
    const body = JSON.stringify(directoryUserCreated());
    const res = await post(body, signedHeaders(body, { prefix: 'svix' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a bad signature sent with svix-* headers', async () => {
    const body = JSON.stringify(directoryUserCreated());
    const res = await post(body, signedHeaders(body, { prefix: 'svix', signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('prefers webhook-* headers when webhook-id is present', async () => {
    const body = JSON.stringify(directoryUserCreated());
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
    const body = JSON.stringify(directoryUserCreated());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(directoryUserCreated());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another endpoint's secret", async () => {
    const other = 'whsec_' + Buffer.from('another-endpoint-secret-01234567').toString('base64');
    const body = JSON.stringify(directoryUserCreated());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(directoryUserCreated());
    const headers = signedHeaders(body);
    const res = await post(body.replace('kai@example.com', 'eve@example.com'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(directoryUserCreated());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(directoryUserCreated());
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
  it('returns 500 when SCALEKIT_WEBHOOK_SECRET is not set', async () => {
    delete process.env.SCALEKIT_WEBHOOK_SECRET;
    const body = JSON.stringify(directoryUserCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
