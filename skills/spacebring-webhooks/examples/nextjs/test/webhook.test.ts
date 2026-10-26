import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/spacebring/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'svix' (Spacebring) or 'webhook' (Standard Webhooks names for the same values)
function send(
  payload: string,
  opts: { msgId?: string; timestamp?: string; signature?: string; headers?: Record<string, string>; contentType?: string; prefix?: string } = {}
) {
  const msgId = opts.msgId ?? `msg_${crypto.randomBytes(12).toString('hex')}`;
  const timestamp = opts.timestamp ?? now();
  const prefix = opts.prefix ?? 'svix';
  const headers = opts.headers ?? {
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: timestamp,
    [`${prefix}-signature`]: opts.signature ?? sign(payload, msgId, timestamp),
  };
  return POST(
    new Request('http://localhost:3000/webhooks/spacebring', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

// Bodies: `type` beside one resource object; subscription.* is a bare object; visitors.* carries `visit` only
const booking = { booking: { id: 'bkg_01' } };
const events: Record<string, Record<string, unknown>> = {
  'benefit.application.created': { application: { id: 'app_01' } },
  'booking.created': booking,
  'booking.deleted': booking,
  'booking.paid': booking,
  'booking.updated': booking,
  'company.created': { company: { id: 'co_01' } },
  'company.deleted': { company: { id: 'co_01' } },
  'event.canceled': { event: { id: 'evt_01' } },
  'event.created': { event: { id: 'evt_01' } },
  'event.deleted': { event: { id: 'evt_01' } },
  'event.ticket.created': { ticket: { id: 'tkt_01' } },
  'event.ticket.paid': { ticket: { id: 'tkt_01' } },
  'event.updated': { event: { id: 'evt_01' } },
  'invoice.issued': { invoice: { id: 'inv_01' } },
  'location.created': { location: { id: 'loc_01' } },
  'location.deleted': { location: { id: 'loc_01' } },
  'location.updated': { location: { id: 'loc_01' } },
  'membership.created': { membership: { id: 'mem_01' } },
  'membership.invited': { membership: { id: 'mem_01' } },
  'resource.created': { resource: { id: 'res_01' } },
  'resource.deleted': { resource: { id: 'res_01' } },
  'resource.updated': { resource: { id: 'res_01' } },
  'shop.order.created': { order: { id: 'ord_01' } },
  'shop.order.paid': { order: { id: 'ord_01' } },
  'subscription.created': { id: 'sub_01' },
  'subscription.deleted': { id: 'sub_01' },
  'subscription.purchased': { id: 'sub_01' },
  'subscription.updated': { id: 'sub_01' },
  'support.ticket.created': { ticket: { id: 'sup_01' } },
  'visitors.request.approved': { visit: { id: 'vis_01' } },
  'visitors.visit.checked_in': { visit: { id: 'vis_01' } },
  'visitors.visit.checked_out': { visit: { id: 'vis_01' } },
};

describe('Spacebring webhook handler', () => {
  beforeEach(() => {
    process.env.SPACEBRING_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ type, ...data }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ type: 'spacebring.something.new' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('spacebring.something.new');
  });

  test('handles a body with no type field (subscription.* and visitors.* bodies)', async () => {
    const res = await send(JSON.stringify({ id: 'sub_01', status: 'active' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: null });
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ type: 'booking.paid', booking: { id: 'bkg_01' } }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ type: 'booking.paid', booking: { id: 'bkg_01' } }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'booking.paid' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"type":"booking.paid"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ type: 'invoice.issued' });
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await send('{}', { headers: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send('{"type":"invoice.issued"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"type":"invoice.issued"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"type":"booking.deleted"}', msgId, timestamp);
    const res = await send('{"type":"booking.paid"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"type":"invoice.issued"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.SPACEBRING_WEBHOOK_SECRET;
    const res = await send('{"type":"invoice.issued"}');
    expect(res.status).toBe(500);
  });
});
