const request = require('supertest');
const crypto = require('crypto');

// Humaans signing secrets are 'whsec_' + base64-encoded key bytes
const WEBHOOK_SECRET = 'whsec_' + Buffer.from('test_humaans_signing_secret_key').toString('base64');
process.env.HUMAANS_WEBHOOK_SECRET = WEBHOOK_SECRET;

const { app } = require('../src/index');

const MSG_ID = 'msg_2lXyZ3AbCdEfGhIjKlMnOpQrSt';

/**
 * Sign a payload exactly as Humaans (Svix / Standard Webhooks) does:
 * base64(HMAC-SHA256(base64decode(secret after whsec_), "{id}.{timestamp}.{body}"))
 */
function sign(body, { id, timestamp, secret = WEBHOOK_SECRET }) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return `v1,${signature}`;
}

function headersFor(body, overrides = {}) {
  const id = overrides.id || MSG_ID;
  const timestamp = overrides.timestamp || Math.floor(Date.now() / 1000);
  const prefix = overrides.prefix || 'webhook';
  return {
    'Content-Type': 'application/json',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: String(timestamp),
    [`${prefix}-signature`]: overrides.signature || sign(body, { id, timestamp, secret: overrides.secret }),
  };
}

const base = {
  id: 'qCNHkhApepOJf0eFHuPzQbDg',
  seq: '01J4GSN4XYQ7401FXCYQPWH3V7',
  ts: '2024-08-05T08:14:24.190Z',
  subject: { id: '8Rc7dFxm7OFoiwxVBIFrLRAi', type: 'person' },
  actor: { personId: '8Rc7dFxm7OFoiwxVBIFrLRAi', type: 'person' },
  entity: { id: 'OCPMqZtTcgFOuoc56TiKo9OT', fieldsChanged: ['name'], next: { name: 'jane' }, prev: { name: null }, customFields: [], metadata: {} },
};
const event = (action) => ({ ...base, action });

describe('POST /webhooks/humaans', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.HUMAANS_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    'person.created',
    'person.updated',
    'person.offboarded',
    'timeAway.created',
    'timeAway.approved',
    'compensation.updated',
    'equipment.deleted',
  ])('accepts a correctly signed %s event', async (action) => {
    const body = JSON.stringify(event(action));
    const res = await request(app).post('/webhooks/humaans').set(headersFor(body)).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts svix-* headers', async () => {
    const body = JSON.stringify(event('person.created'));
    const res = await request(app).post('/webhooks/humaans').set(headersFor(body, { prefix: 'svix' })).send(body);
    expect(res.status).toBe(200);
  });

  it('accepts any content type (raw body is read for every type)', async () => {
    const body = JSON.stringify(event('person.created'));
    const headers = { ...headersFor(body), 'Content-Type': 'text/plain' };
    const res = await request(app).post('/webhooks/humaans').set(headers).send(body);
    expect(res.status).toBe(200);
  });

  it('accepts when one of several space-delimited signatures matches', async () => {
    const body = JSON.stringify(event('person.created'));
    const headers = headersFor(body);
    headers['webhook-signature'] = `v1,aW52YWxpZHNpZ25hdHVyZQ== ${headers['webhook-signature']}`;
    const res = await request(app).post('/webhooks/humaans').set(headers).send(body);
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify(event('person.created'));
    const headers = headersFor(body, { signature: 'v1,aW52YWxpZHNpZ25hdHVyZQ==' });
    const res = await request(app).post('/webhooks/humaans').set(headers).send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const body = JSON.stringify(event('person.created'));
    const other = 'whsec_' + Buffer.from('some_other_secret').toString('base64');
    const res = await request(app).post('/webhooks/humaans').set(headersFor(body, { secret: other })).send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(event('person.created'));
    const headers = headersFor(body);
    const tampered = JSON.stringify(event('person.deleted'));
    const res = await request(app).post('/webhooks/humaans').set(headers).send(tampered);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than 5 minutes (library window)', async () => {
    const body = JSON.stringify(event('person.created'));
    const timestamp = Math.floor(Date.now() / 1000) - 600;
    const res = await request(app).post('/webhooks/humaans').set(headersFor(body, { timestamp })).send(body);
    expect(res.status).toBe(400);
  });

  it.each(['id', 'timestamp', 'signature'])('rejects a request missing webhook-%s', async (name) => {
    const body = JSON.stringify(event('person.created'));
    const headers = headersFor(body);
    delete headers[`webhook-${name}`];
    const res = await request(app).post('/webhooks/humaans').set(headers).send(body);
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.HUMAANS_WEBHOOK_SECRET;
    const body = JSON.stringify(event('person.created'));
    const res = await request(app).post('/webhooks/humaans').set(headersFor(body)).send(body);
    expect(res.status).toBe(500);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
