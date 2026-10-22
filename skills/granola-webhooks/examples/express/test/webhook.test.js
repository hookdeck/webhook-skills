const request = require('supertest');
const crypto = require('crypto');

// Granola signing secrets are 'whsec_' + base64-encoded key bytes
const WEBHOOK_SECRET = 'whsec_' + Buffer.from('test_granola_signing_secret_key').toString('base64');
process.env.GRANOLA_WEBHOOK_SECRET = WEBHOOK_SECRET;

const { app } = require('../src/index');

/**
 * Sign a payload exactly as Granola does (Standard Webhooks):
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
  const id = overrides.id || '8f1c2a4e-6b3d-4e8f-9a2b-1c5d7e9f0a3b';
  const timestamp = overrides.timestamp || Math.floor(Date.now() / 1000);
  return {
    'Content-Type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': overrides.signature || sign(body, { id, timestamp, secret: overrides.secret }),
  };
}

const generated = {
  event_id: '8f1c2a4e-6b3d-4e8f-9a2b-1c5d7e9f0a3b',
  event_type: 'note.generated',
  note_id: 'not_1d3tmYTlCICgjy',
  occurred_at: '2026-01-27T15:30:00Z',
};
const edited = { ...generated, event_type: 'note.edited', data: { changed_fields: ['summary'] } };
const accessGranted = { ...generated, event_type: 'note.access_granted' };

describe('POST /webhooks/granola', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.GRANOLA_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['note.generated', generated],
    ['note.edited', edited],
    ['note.access_granted', accessGranted],
  ])('accepts a correctly signed %s event', async (_name, payload) => {
    const body = JSON.stringify(payload);
    const res = await request(app).post('/webhooks/granola').set(headersFor(body)).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts any content type (raw body is read for every type)', async () => {
    const body = JSON.stringify(generated);
    const headers = { ...headersFor(body), 'Content-Type': 'text/plain' };
    const res = await request(app).post('/webhooks/granola').set(headers).send(body);
    expect(res.status).toBe(200);
  });

  it('accepts when one of several space-delimited signatures matches', async () => {
    const body = JSON.stringify(generated);
    const headers = headersFor(body);
    headers['webhook-signature'] = `v1,aW52YWxpZHNpZ25hdHVyZQ== ${headers['webhook-signature']}`;
    const res = await request(app).post('/webhooks/granola').set(headers).send(body);
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify(generated);
    const headers = headersFor(body, { signature: 'v1,aW52YWxpZHNpZ25hdHVyZQ==' });
    const res = await request(app).post('/webhooks/granola').set(headers).send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const body = JSON.stringify(generated);
    const other = 'whsec_' + Buffer.from('some_other_secret').toString('base64');
    const res = await request(app).post('/webhooks/granola').set(headersFor(body, { secret: other })).send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(generated);
    const headers = headersFor(body);
    const tampered = JSON.stringify({ ...generated, note_id: 'not_tampered' });
    const res = await request(app).post('/webhooks/granola').set(headers).send(tampered);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than 5 minutes', async () => {
    const body = JSON.stringify(generated);
    const timestamp = Math.floor(Date.now() / 1000) - 600;
    const res = await request(app).post('/webhooks/granola').set(headersFor(body, { timestamp })).send(body);
    expect(res.status).toBe(400);
  });

  it.each(['webhook-id', 'webhook-timestamp', 'webhook-signature'])('rejects a request missing %s', async (header) => {
    const body = JSON.stringify(generated);
    const headers = headersFor(body);
    delete headers[header];
    const res = await request(app).post('/webhooks/granola').set(headers).send(body);
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.GRANOLA_WEBHOOK_SECRET;
    const body = JSON.stringify(generated);
    const res = await request(app).post('/webhooks/granola').set(headersFor(body)).send(body);
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
