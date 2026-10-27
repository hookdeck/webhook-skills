// Generated with: basiq-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Basiq secrets look like "whsec_" + base64(key bytes), for example
// "whsec_MA4V6bD7rB0Hcm2aw8ghgDeQ5UAak24DwnX0rX6". The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('basiq-test-signing-key-0123456789').toString('base64');
const OTHER_SECRET = 'whsec_' + Buffer.from('another-subscriptions-signing-key').toString('base64');

process.env.BASIQ_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** Sign exactly like Basiq does: v1,base64(HMAC-SHA256(key, id.timestamp.body)). */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, { id, timestamp, secret, signature, prefix = 'webhook' } = {}) {
  const msgId = id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/basiq').set(headers).send(rawBody);
}

const notification = (eventTypeId, entityPath = 'users/88a85f64-5717-4562-b3fc-2c963f66af88') => {
  const eventId = crypto.randomBytes(32).toString('hex');
  return {
    eventTypeId,
    eventId,
    links: {
      event: `https://au-api.basiq.io/events/${eventId}`,
      eventEntity: `https://au-api.basiq.io/${entityPath}`,
    },
  };
};

beforeEach(() => {
  process.env.BASIQ_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  const documented = [
    ['user.created'],
    ['user.updated'], ['user.deleted'],
    ['connection.created'], ['connection.activated'], ['connection.invalidated'], ['connection.deleted'],
    ['consent.created'], ['consent.updated'], ['consent.revoked'],
    ['consent.expired'], ['consent.reminder'], ['consent.warning'],
    ['account.updated'], ['transactions.updated'],
  ];

  it.each(documented)('accepts and handles %s', async (eventTypeId) => {
    const body = JSON.stringify(notification(eventTypeId));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.not.stringContaining('Unhandled'));
  });

  it('logs unknown event types as unhandled but still returns 200', async () => {
    const body = JSON.stringify(notification('something.new'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Unhandled Basiq event type: something.new');
  });

  it('verifies the raw bytes, including odd whitespace', async () => {
    const body = JSON.stringify(notification('user.created'), null, 4);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts any content type', async () => {
    const body = JSON.stringify(notification('user.created'));
    const headers = { ...signedHeaders(body), 'content-type': 'text/plain' };
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('accepts when one of several signatures matches', async () => {
    const body = JSON.stringify(notification('consent.revoked', 'consents/abc'));
    const headers = signedHeaders(body);
    const stale = sign(body, 'other-id', headers['webhook-timestamp']);
    headers['webhook-signature'] = `${stale} ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('ignores signature versions other than v1', async () => {
    const body = JSON.stringify(notification('user.created'));
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1a,${headers['webhook-signature'].slice(3)} ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('falls back to the svix-* headers when webhook-id is absent', async () => {
    const body = JSON.stringify(notification('account.updated', 'users/u1/accounts/a1'));
    const res = await post(body, signedHeaders(body, { prefix: 'svix' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('prefers webhook-* over svix-* when both are present', async () => {
    const body = JSON.stringify(notification('user.created'));
    const good = signedHeaders(body);
    const bad = signedHeaders(body, { prefix: 'svix', signature: 'v1,AAAA' });
    const res = await post(body, { ...good, 'svix-id': bad['svix-id'], 'svix-timestamp': bad['svix-timestamp'], 'svix-signature': bad['svix-signature'] });
    expect(res.status).toBe(200);
  });
});

describe('invalid requests', () => {
  it('rejects a tampered body', async () => {
    const body = JSON.stringify(notification('user.created'));
    const headers = signedHeaders(body);
    const res = await post(body.replace('user.created', 'user.deleted'), headers);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  it("rejects another subscription's secret", async () => {
    const body = JSON.stringify(notification('user.created'));
    const res = await post(body, signedHeaders(body, { secret: OTHER_SECRET }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp more than 5 minutes old', async () => {
    const body = JSON.stringify(notification('user.created'));
    const res = await post(body, signedHeaders(body, { timestamp: now() - 6 * 60 }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp more than 5 minutes in the future', async () => {
    const body = JSON.stringify(notification('user.created'));
    const res = await post(body, signedHeaders(body, { timestamp: now() + 6 * 60 }));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed signature', async () => {
    const body = JSON.stringify(notification('user.created'));
    const res = await post(body, signedHeaders(body, { signature: 'not-a-signature' }));
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric timestamp', async () => {
    const body = JSON.stringify(notification('user.created'));
    const res = await post(body, signedHeaders(body, { timestamp: 'yesterday', signature: 'v1,AAAA' }));
    expect(res.status).toBe(400);
  });

  it.each(['webhook-id', 'webhook-timestamp', 'webhook-signature'])('rejects a missing %s header', async (name) => {
    const body = JSON.stringify(notification('user.created'));
    const headers = signedHeaders(body);
    delete headers[name];
    const res = await post(body, headers);
    expect(res.status).toBe(400);
  });

  it('rejects a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });
});

describe('fail closed', () => {
  it('returns 500 and ignores the request when the secret is unset', async () => {
    delete process.env.BASIQ_WEBHOOK_SECRET;
    const body = JSON.stringify(notification('user.created'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('user.created'));
  });
});

describe('resent messages', () => {
  it('acknowledges a repeated webhook-id without handling it twice', async () => {
    const body = JSON.stringify(notification('transactions.updated', 'users/u1/transactions'));
    const headers = signedHeaders(body, { id: 'msg_resend_1' });
    const first = await post(body, headers);
    expect(first.body).toEqual({ received: true });
    const logCalls = console.log.mock.calls.length;
    const second = await post(body, headers);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
    expect(console.log.mock.calls.length).toBe(logCalls);
  });
});

describe('health', () => {
  it('responds on /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
