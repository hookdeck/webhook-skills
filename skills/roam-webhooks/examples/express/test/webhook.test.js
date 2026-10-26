const request = require('supertest');
const crypto = require('crypto');

// Roam signing secrets are 'whsec_' + base64-encoded key bytes
const WEBHOOK_SECRET = 'whsec_' + Buffer.from('test_roam_signing_secret_key').toString('base64');
process.env.ROAM_WEBHOOK_SIGNING_SECRET = WEBHOOK_SECRET;

const { app, seen } = require('../src/index');

/**
 * Sign a payload as Roam does (Standard Webhooks):
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

const EVENT_ID = '0197f9a1-7d2e-7cc3-9f6a-8b1c2d3e4f5a';
let counter = 0;

function headersFor(body, overrides = {}) {
  const id = overrides.id || EVENT_ID;
  const timestamp = overrides.timestamp || Math.floor(Date.now() / 1000);
  return {
    'Content-Type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': overrides.signature || sign(body, { id, timestamp, secret: overrides.secret }),
  };
}

const envelope = (type, data) => ({
  type,
  eventId: EVENT_ID,
  timestamp: '2026-07-07T18:23:45.123456Z',
  apiVersion: '2026-07-07',
  data,
});

const chatMessage = envelope('chat.message', { chatId: 'c1', userId: 'u1', version: 1, text: 'hi' });
const chatDeleted = envelope('chat.message', { chatId: 'c1', userId: 'u1', version: 2, contentType: 'deleted' });
const chatReaction = envelope('chat.reaction', { chatId: 'c1', userId: 'u1' });
const meetingStarted = envelope('meeting.started', { id: 'm1' });
const meetingEnded = envelope('meeting.ended', { id: 'm1', title: 'Weekly Team Standup', hasVideo: true });
const lobbyBooked = envelope('lobby.booked', { lobbyId: 'l1' });
const magicastCreated = envelope('magicast.created', { id: 'mg1' });
const onairCreated = envelope('onair.event.created', { id: 'e1' });
const legacyBody = { type: 'message', sender: 'B-123', chat: 'D-456', text: 'hi' };

// Each test uses a fresh webhook-id unless it is testing dedupe
const freshId = () => `msg_${++counter}`;

describe('POST /webhooks/roam', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.ROAM_WEBHOOK_SIGNING_SECRET = WEBHOOK_SECRET;
    seen.clear();
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['chat.message', chatMessage],
    ['chat.message (deleted)', chatDeleted],
    ['chat.reaction', chatReaction],
    ['meeting.started', meetingStarted],
    ['meeting.ended', meetingEnded],
    ['lobby.booked', lobbyBooked],
    ['magicast.created', magicastCreated],
    ['onair.event.created', onairCreated],
  ])('accepts a correctly signed %s event', async (_name, payload) => {
    const body = JSON.stringify(payload);
    const res = await request(app).post('/webhooks/roam').set(headersFor(body, { id: freshId() })).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts any content type (raw body is read for every type)', async () => {
    const body = JSON.stringify(chatMessage);
    const headers = { ...headersFor(body, { id: freshId() }), 'Content-Type': 'text/plain' };
    const res = await request(app).post('/webhooks/roam').set(headers).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts when one of several space-delimited signatures matches', async () => {
    const body = JSON.stringify(chatMessage);
    const headers = headersFor(body, { id: freshId() });
    headers['webhook-signature'] = `v1,aW52YWxpZHNpZ25hdHVyZQ== ${headers['webhook-signature']}`;
    const res = await request(app).post('/webhooks/roam').set(headers).send(body);
    expect(res.status).toBe(200);
  });

  it('dedupes a repeated webhook-id', async () => {
    const body = JSON.stringify(chatMessage);
    const first = await request(app).post('/webhooks/roam').set(headersFor(body)).send(body);
    const second = await request(app).post('/webhooks/roam').set(headersFor(body)).send(body);
    expect(first.body).toEqual({ received: true });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });

  it('skips the legacy body without consuming the webhook-id', async () => {
    const legacy = JSON.stringify(legacyBody);
    const v1 = JSON.stringify(chatMessage);
    const a = await request(app).post('/webhooks/roam').set(headersFor(legacy)).send(legacy);
    const b = await request(app).post('/webhooks/roam').set(headersFor(v1)).send(v1);
    expect(a.body).toEqual({ received: true, ignored: 'legacy body' });
    expect(b.body).toEqual({ received: true });
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify(chatMessage);
    const headers = headersFor(body, { signature: 'v1,aW52YWxpZHNpZ25hdHVyZQ==' });
    const res = await request(app).post('/webhooks/roam').set(headers).send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const body = JSON.stringify(chatMessage);
    const other = 'whsec_' + Buffer.from('some_other_secret').toString('base64');
    const res = await request(app).post('/webhooks/roam').set(headersFor(body, { secret: other })).send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(chatMessage);
    const headers = headersFor(body);
    const tampered = JSON.stringify({ ...chatMessage, data: { ...chatMessage.data, text: 'tampered' } });
    const res = await request(app).post('/webhooks/roam').set(headers).send(tampered);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than 5 minutes (library window)', async () => {
    const body = JSON.stringify(chatMessage);
    const timestamp = Math.floor(Date.now() / 1000) - 600;
    const res = await request(app).post('/webhooks/roam').set(headersFor(body, { timestamp })).send(body);
    expect(res.status).toBe(400);
  });

  it.each(['webhook-id', 'webhook-timestamp', 'webhook-signature'])('rejects a request missing %s (unsigned delivery)', async (header) => {
    const body = JSON.stringify(chatMessage);
    const headers = headersFor(body);
    delete headers[header];
    const res = await request(app).post('/webhooks/roam').set(headers).send(body);
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.ROAM_WEBHOOK_SIGNING_SECRET;
    const body = JSON.stringify(chatMessage);
    const res = await request(app).post('/webhooks/roam').set(headersFor(body)).send(body);
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
