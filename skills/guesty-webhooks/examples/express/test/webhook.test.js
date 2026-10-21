import request from 'supertest';
import crypto from 'node:crypto';
import { app } from '../src/index.js';

// Test signing secret in the Svix default format: 'whsec_' + base64(key).
// base64 of "guesty_test_secret_key_123"
const TEST_SECRET = 'whsec_Z3Vlc3R5X3Rlc3Rfc2VjcmV0X2tleV8xMjM=';
process.env.GUESTY_WEBHOOK_SECRET = TEST_SECRET; // read per request by the handler

// Sign exactly as Svix does for Guesty:
// base64(HMAC_SHA256(base64Decode(secret after whsec_), `${id}.${timestamp}.${body}`))
function sign(payload, msgId, timestamp, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key)
    .update(`${msgId}.${timestamp}.${payload}`)
    .digest('base64');
  return `v1,${sig}`;
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

function newMsgId() {
  return 'msg_' + crypto.randomBytes(12).toString('hex');
}

function send(payload, headers) {
  return request(app)
    .post('/webhooks/guesty')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(payload);
}

function signedHeaders(payload, { msgId = newMsgId(), timestamp = now(), signature } = {}) {
  return {
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': signature || sign(payload, msgId, timestamp),
  };
}

const reservationCreated = {
  event: 'reservation.created.v2',
  data: {
    reservationId: '6a96ae8ea07eac3dcadf0aab',
    accountId: '66053c21dd2adbdfb3b383b7',
    status: 'confirmed',
    confirmationCode: 'GY-pCCSraYC',
  },
  meta: {
    eventId: 'b708e831-d9fc-44d5-b94a-3ff72a0ef815',
    publishedAt: '2026-09-01T10:53:03.025Z',
  },
};

describe('Guesty Webhook Handler', () => {
  test('accepts a validly signed webhook', async () => {
    const payload = JSON.stringify(reservationCreated);
    const res = await send(payload, signedHeaders(payload));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event: 'reservation.created.v2' });
  });

  test('accepts when any of multiple signatures matches (secret rotation)', async () => {
    const payload = JSON.stringify(reservationCreated);
    const msgId = newMsgId();
    const timestamp = now();
    const valid = sign(payload, msgId, timestamp);
    const res = await send(payload, signedHeaders(payload, {
      msgId,
      timestamp,
      signature: `v1,aW52YWxpZF9zaWduYXR1cmU= ${valid}`,
    }));

    expect(res.status).toBe(200);
  });

  test('rejects missing svix headers', async () => {
    const payload = JSON.stringify(reservationCreated);
    const res = await send(payload, {});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const payload = JSON.stringify(reservationCreated);
    const res = await send(payload, signedHeaders(payload, {
      signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=',
    }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = JSON.stringify(reservationCreated);
    const msgId = newMsgId();
    const timestamp = now();
    const otherSecret = 'whsec_' + Buffer.from('some_other_secret').toString('base64');
    const res = await send(payload, signedHeaders(payload, {
      msgId,
      timestamp,
      signature: sign(payload, msgId, timestamp, otherSecret),
    }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a tampered body', async () => {
    const payload = JSON.stringify(reservationCreated);
    const headers = signedHeaders(payload);
    const tampered = payload.replace('confirmed', 'canceled');
    const res = await send(tampered, headers);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a stale timestamp', async () => {
    const payload = JSON.stringify(reservationCreated);
    const old = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(payload, signedHeaders(payload, { timestamp: old }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid timestamp');
  });

  test.each([
    ['reservation.created.v2', { data: { reservationId: 'r1' }, meta: { eventId: 'e1' } }],
    ['reservation.updated.v2', { data: { reservationId: 'r1' }, meta: { eventId: 'e2', changedFields: ['notes'], subType: 'NOTES_ALTERED' } }],
    ['reservation.new', { reservation: { _id: 'r1' }, meta: { eventId: 'e3', messageId: 'm3' } }],
    ['reservation.updated', { reservation: { _id: 'r1' }, reservationBefore: { _id: 'r1' }, meta: { eventId: 'e4' } }],
    ['listing.new', { listing: { _id: 'l1' }, meta: { eventId: 'e5' } }],
    ['listing.updated', { listing: { _id: 'l1' }, meta: { eventId: 'e6' } }],
    ['listing.removed', { listing: { _id: 'l1' }, meta: { eventId: 'e7' } }],
    ['guest.created', { guest: { _id: 'g1' }, by: 'user@example.com' }],
    ['payments.received', { payment: { reservationId: 'r1', amount: 190, currency: 'USD' } }],
  ])('handles %s', async (eventName, body) => {
    const payload = JSON.stringify({ event: eventName, ...body });
    const res = await send(payload, signedHeaders(payload));

    expect(res.status).toBe(200);
    expect(res.body.event).toBe(eventName);
  });

  test('acknowledges unknown events', async () => {
    const payload = JSON.stringify({ event: 'task.created', task: { _id: 't1' } });
    const res = await send(payload, signedHeaders(payload));

    expect(res.status).toBe(200);
    expect(res.body.event).toBe('task.created');
  });

  test('health check endpoint works', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
