import { describe, test, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/guesty/route';

// Test signing secret in the Svix default format: 'whsec_' + base64(key).
// base64 of "guesty_test_secret_key_123"
const TEST_SECRET = 'whsec_Z3Vlc3R5X3Rlc3Rfc2VjcmV0X2tleV8xMjM=';

// Sign exactly as Svix does for Guesty:
// base64(HMAC_SHA256(base64Decode(secret after whsec_), `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();
const newMsgId = () => 'msg_' + crypto.randomBytes(12).toString('hex');

function signedHeaders(
  payload: string,
  opts: { msgId?: string; timestamp?: string; signature?: string } = {}
): Record<string, string> {
  const msgId = opts.msgId ?? newMsgId();
  const timestamp = opts.timestamp ?? now();
  return {
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': opts.signature ?? sign(payload, msgId, timestamp),
  };
}

function send(payload: string, headers: Record<string, string>) {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/guesty', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: payload,
    })
  );
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
  beforeAll(() => {
    process.env.GUESTY_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('accepts a validly signed webhook', async () => {
    const payload = JSON.stringify(reservationCreated);
    const res = await send(payload, signedHeaders(payload));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event: 'reservation.created.v2' });
  });

  test('accepts when any of multiple signatures matches (secret rotation)', async () => {
    const payload = JSON.stringify(reservationCreated);
    const msgId = newMsgId();
    const timestamp = now();
    const valid = sign(payload, msgId, timestamp);
    const res = await send(
      payload,
      signedHeaders(payload, { msgId, timestamp, signature: `v1,aW52YWxpZF9zaWduYXR1cmU= ${valid}` })
    );

    expect(res.status).toBe(200);
  });

  test('rejects missing svix headers', async () => {
    const res = await send(JSON.stringify(reservationCreated), {});

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const payload = JSON.stringify(reservationCreated);
    const res = await send(payload, signedHeaders(payload, { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = JSON.stringify(reservationCreated);
    const msgId = newMsgId();
    const timestamp = now();
    const otherSecret = 'whsec_' + Buffer.from('some_other_secret').toString('base64');
    const res = await send(
      payload,
      signedHeaders(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp, otherSecret) })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a tampered body', async () => {
    const payload = JSON.stringify(reservationCreated);
    const headers = signedHeaders(payload);
    const res = await send(payload.replace('confirmed', 'canceled'), headers);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a stale timestamp', async () => {
    const payload = JSON.stringify(reservationCreated);
    const old = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(payload, signedHeaders(payload, { timestamp: old }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid timestamp');
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
    expect((await res.json()).event).toBe(eventName);
  });

  test('acknowledges unknown events', async () => {
    const payload = JSON.stringify({ event: 'task.created', task: { _id: 't1' } });
    const res = await send(payload, signedHeaders(payload));

    expect(res.status).toBe(200);
    expect((await res.json()).event).toBe('task.created');
  });
});
