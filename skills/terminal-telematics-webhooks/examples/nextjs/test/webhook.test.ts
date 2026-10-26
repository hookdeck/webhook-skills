import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/terminal-telematics/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'svix' (Svix's header names) or 'webhook' (the Standard Webhooks names for the same values)
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
    new Request('http://localhost:3000/webhooks/terminal-telematics', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

const conn = { id: 'cnn_01J', provider: { code: 'samsara', name: 'Samsara' }, externalId: 'acme' };

const events: Record<string, Record<string, unknown>> = {
  'connection.created': { connection: conn },
  'connection.disconnected': { connection: conn },
  'connection.reconnected': { connection: conn },
  'connection.completed': { connection: conn, metadata: {} },
  'connection.updated': { connection: conn },
  'connection.pending_deletion': { connection: conn },
  'connection.deleted': { connection: conn },
  'sync.requested': { connection: conn, sync: { id: 'sync_01J', status: 'completed' } },
  'sync.started': { connection: conn, sync: { id: 'sync_01J', status: 'completed' } },
  'sync.completed': { connection: conn, sync: { id: 'sync_01J', status: 'completed' } },
  'sync.failed': { connection: conn, sync: { id: 'sync_01J', status: 'failed', failureReason: 'provider_unavailable' } },
  'connection.first_sync_completed': { connection: conn, sync: { id: 'sync_01J', status: 'completed' } },
  'delivery.requested': { destination: { id: 'dest_01J', type: 's3' }, delivery: { id: 'dlv_01J', status: 'completed' } },
  'delivery.started': { destination: { id: 'dest_01J', type: 's3' }, delivery: { id: 'dlv_01J', status: 'completed' } },
  'delivery.failed': { destination: { id: 'dest_01J', type: 's3' }, delivery: { id: 'dlv_01J', status: 'completed' } },
  'delivery.completed': { destination: { id: 'dest_01J', type: 's3' }, delivery: { id: 'dlv_01J', status: 'completed' } },
  'issue.reported': { connection: conn, issue: { id: 'iss_01J', status: 'ongoing' } },
  'issue.resolved': { connection: conn, issue: { id: 'iss_01J', status: 'ongoing' } },
  'provider.availability_updated': { provider: { code: 'samsara', name: 'Samsara', baseCode: 'samsara' }, availability: { current: 'degraded', previous: 'available' }, update: { impacted: [], message: 'Provider outage' } },
  'unsupported_provider.requested': { contactEmail: 'ops@example.com', provider: 'Acme Telematics' },
  'link.analytics_event_emitted': {},
  'vehicle.added': { connection: conn, vehicle: { id: 'veh_01J', status: 'active' } },
  'vehicle.modified': { connection: conn, vehicle: { id: 'veh_01J', status: 'active' } },
  'vehicle.removed': { connection: conn, vehicle: { id: 'veh_01J', status: 'active' } },
  'driver.added': { connection: conn, driver: { id: 'drv_01J' } },
  'driver.modified': { connection: conn, driver: { id: 'drv_01J' } },
  'driver.removed': { connection: conn, driver: { id: 'drv_01J' } },
  'trailer.added': { connection: conn, trailer: { id: 'trl_01J' } },
  'trailer.modified': { connection: conn, trailer: { id: 'trl_01J' } },
  'trailer.removed': { connection: conn, trailer: { id: 'trl_01J' } },
  'safety_event.added': { connection: conn, safetyEvent: { id: 'saf_01J', type: 'harsh_braking' } },
  'safety_event.modified': { connection: conn, safetyEvent: { id: 'saf_01J', type: 'harsh_braking' } },
};

describe('Terminal webhook handler', () => {
  beforeEach(() => {
    process.env.TERMINAL_TELEMATICS_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ id: 'evt_01J', type, detail: data }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ id: 'evt_01J', type: 'sync.something_new', detail: {} }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('sync.something_new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ id: 'evt_01J', type: 'sync.completed', detail: events['sync.completed'] }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ id: 'evt_01J', type: 'sync.completed', detail: events['sync.completed'] }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'sync.completed' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"type":"sync.completed"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ type: 'sync.completed' });
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
    const res = await send('{"type":"sync.completed"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"type":"sync.completed"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a signed body that is not a JSON object', async () => {
    const res = await send('null');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"type":"sync.failed"}', msgId, timestamp);
    const res = await send('{"type":"sync.completed"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"type":"sync.completed"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.TERMINAL_TELEMATICS_WEBHOOK_SECRET;
    const res = await send('{"type":"sync.completed"}');
    expect(res.status).toBe(500);
  });
});
