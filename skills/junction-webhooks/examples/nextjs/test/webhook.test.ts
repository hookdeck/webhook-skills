import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/junction/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'svix' (Junction) or 'webhook' (Standard Webhooks names for the same values)
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
    new Request('http://localhost:3000/webhooks/junction', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

const envelope = { team_id: 'team_1', user_id: 'user_1', client_user_id: 'client_1' };

const events: Record<string, Record<string, unknown>> = {
  'provider.connection.created': { source: { name: 'Strava', slug: 'strava', logo: 'https://example.com/strava.png' }, user_id: 'user_1' },
  'provider.connection.error': { user_id: 'user_1' },
  'provider.device.created': { user_id: 'user_1' },
  'provider.device.updated': { user_id: 'user_1' },
  'daily.data.activity.created': { id: 'act_1', steps: 1496, source: { name: 'Apple HealthKit', slug: 'apple_health_kit' }, user_id: 'user_1' },
  'daily.data.activity.updated': { id: 'act_1', steps: 2100, source: { name: 'Apple HealthKit', slug: 'apple_health_kit' }, user_id: 'user_1' },
  'daily.data.sleep.created': { id: 'sleep_1', source: { name: 'Oura', slug: 'oura' }, user_id: 'user_1' },
  'daily.data.sleep_cycle.updated': { id: 'cycle_1', source: { name: 'Oura', slug: 'oura' }, user_id: 'user_1' },
  'daily.data.workouts.created': { id: 'wo_1', calories: 4470, source: { name: 'Zwift', slug: 'zwift' }, user_id: 'user_1' },
  'daily.data.steps.created': { data: [{ timestamp: '2023-05-16T10:00:00+00:00', unit: 'count', value: 237 }], source_id: 16, source: { name: 'Fitbit', slug: 'fitbit' }, user_id: 'user_1' },
  'daily.data.glucose.updated': { data: [{ timestamp: '2023-05-16T10:00:00+00:00', unit: 'mg/dL', value: 98 }], source_id: 3, source: { name: 'Freestyle Libre', slug: 'freestyle_libre_ble' }, user_id: 'user_1' },
  'historical.data.workouts.created': { user_id: 'user_1', start_date: '2020-06-21T08:23:01+00:00', end_date: '2024-11-02T14:39:28+00:00', provider: 'zwift' },
  'historical.data.sleep.created': { user_id: 'user_1', start_date: '2020-06-21T08:23:01+00:00', end_date: '2024-11-02T14:39:28+00:00', provider: 'oura' },
  'labtest.order.created': { id: 'order_1' },
  'labtest.order.updated': { id: 'order_1' },
  'labtest.appointment.created': { id: 'appt_1' },
  'labtest.appointment.updated': { id: 'appt_1' },
  'labtest.result.critical': { id: 'order_1' },
  'continuous_query.result_table.changed': {},
};

describe('Junction webhook handler', () => {
  beforeEach(() => {
    process.env.JUNCTION_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ event_type: type, data, ...envelope }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ event_type: 'junction.something.new' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('junction.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ event_type: 'daily.data.sleep.created', data: { id: 'sleep_1' } }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ event_type: 'daily.data.sleep.created', data: { id: 'sleep_1' } }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'daily.data.sleep.created' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"event_type":"daily.data.sleep.created"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ event_type: 'provider.connection.created' });
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
    const res = await send('{"event_type":"provider.connection.created"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"event_type":"provider.connection.created"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"event_type":"daily.data.sleep.updated"}', msgId, timestamp);
    const res = await send('{"event_type":"daily.data.sleep.created"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"event_type":"provider.connection.created"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.JUNCTION_WEBHOOK_SECRET;
    const res = await send('{"event_type":"provider.connection.created"}');
    expect(res.status).toBe(500);
  });
});
