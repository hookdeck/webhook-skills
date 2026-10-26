import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { POST } from '../app/webhooks/isnap/route';

// Standard Webhooks secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';
const OTHER_SECRET = 'whsec_b3RoZXJfc2VjcmV0X2tleQ==';

// Standard Webhooks algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();
const eventId = () => `evt_${crypto.randomBytes(12).toString('hex')}`;

function send(
  payload: string,
  opts: {
    msgId?: string;
    timestamp?: string;
    signature?: string;
    headers?: Record<string, string>;
    contentType?: string;
    prefix?: 'svix' | 'webhook';
  } = {}
) {
  const msgId = opts.msgId ?? eventId();
  const timestamp = opts.timestamp ?? now();
  const prefix = opts.prefix ?? 'webhook';
  const headers: Record<string, string> = opts.headers ?? {
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: timestamp,
    [`${prefix}-signature`]: opts.signature ?? sign(payload, msgId, timestamp),
  };
  return POST(
    new Request('http://localhost:3000/webhooks/isnap', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

function envelope(type: string, opts: { id?: string; data?: Record<string, unknown> } = {}) {
  return JSON.stringify({
    api_version: 'v1',
    event_id: opts.id ?? eventId(),
    event_type: type,
    created_at: '2026-10-08T14:22:57.143Z',
    trace_id: '174b4a27e4e4938fa67ea87b23a18579',
    data: { ...opts.data, metadata: null, line_metadata: null },
  });
}

// The 37 documented event types
const events = [
  'message.queued', 'message.scheduled', 'message.sent', 'message.delivered', 'message.read',
  'message.failed', 'message.received', 'message.cancelled', 'message.fallback_triggered',
  'reaction.added', 'reaction.received', 'reaction.removed',
  'typing_indicator.started', 'typing_indicator.stopped',
  'line.connected', 'line.disconnected', 'line.offline', 'line.degraded', 'line.apple_id_flagged',
  'line.quota_warning', 'line.quota_exceeded', 'line.capability_changed', 'line.terminated',
  'line.variant_changed', 'line.variant_scheduled', 'line.variant_unscheduled',
  'trial.linked', 'trial.dormant', 'trial.reactivated', 'trial.bind_conflict', 'trial.revoked',
  'pre_order.fulfilled', 'pre_order.cancelled',
  'macos_session.rented', 'macos_session.released',
  'binding.released',
  'webhook.test',
];

describe('iSnap webhook handler', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.ISNAP_WEBHOOK_SECRET = TEST_SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const logged = () => logSpy.mock.calls.map((call) => call.join(' ')).join('\n');

  test('signing matches the documented test vector', () => {
    const body =
      '{"api_version":"v1","event_id":"evt_2Yc8RkP4mWq7Lx3Nv9Tb5Hs1D","event_type":"webhook.test","created_at":"2025-10-09T08:53:20.000Z","trace_id":"0af7651916cd43dd8448eb211c80319c","data":{"webhook_id":"11111111-2222-3333-4444-555555555555","probe":true,"metadata":null,"line_metadata":null}}';
    const secret = 'whsec_00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
    expect(sign(body, 'evt_2Yc8RkP4mWq7Lx3Nv9Tb5Hs1D', '1760000000', secret)).toBe(
      'v1,ushTjsgTdwRRBRQL1d56b6HFFwfVHNqiwwtkAn0HlsI='
    );
  });

  test.each(events)('acknowledges %s with an empty 204', async (type) => {
    const res = await send(envelope(type));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(logged()).not.toContain('Unhandled event type');
  });

  test('routes message.received with the message id and chat id', async () => {
    const res = await send(
      envelope('message.received', { data: { message: { id: 'msg_abc' }, chat_id: 'chat_xyz' } })
    );
    expect(res.status).toBe(204);
    expect(logged()).toContain('Message received: msg_abc in chat chat_xyz');
  });

  test('acknowledges an event type it does not know', async () => {
    const res = await send(envelope('future.event'));
    expect(res.status).toBe(204);
    expect(logged()).toContain('Unhandled event type: future.event');
  });

  test('processes a redelivered event_id only once', async () => {
    const id = eventId();
    const payload = envelope('message.delivered', { id, data: { message: { id: 'msg_dup' } } });
    expect((await send(payload, { msgId: id })).status).toBe(204);
    expect((await send(payload, { msgId: id })).status).toBe(204);
    expect(logged().match(/Message status message.delivered: msg_dup/g)).toHaveLength(1);
    expect(logged()).toContain(`Duplicate iSnap event ${id}`);
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(envelope('message.received'), { prefix: 'svix' });
    expect(res.status).toBe(204);
  });

  test('prefers the webhook-* headers when both sets are present', async () => {
    const payload = envelope('message.received');
    const msgId = eventId();
    const timestamp = now();
    const res = await send(payload, {
      headers: {
        'webhook-id': msgId,
        'webhook-timestamp': timestamp,
        'webhook-signature': sign(payload, msgId, timestamp),
        'svix-id': 'evt_other',
        'svix-timestamp': timestamp,
        'svix-signature': 'v1,AAAA',
      },
    });
    expect(res.status).toBe(204);
  });

  test('verifies the raw bytes whatever the content type', async () => {
    const res = await send(envelope('message.received'), { contentType: 'text/plain' });
    expect(res.status).toBe(204);
  });

  test('verifies the exact raw bytes, including odd whitespace', async () => {
    const payload = `{ "api_version" : "v1",\n "event_id":"${eventId()}", "event_type":"message.sent", "data":{"metadata":null,"line_metadata":null} }`;
    const res = await send(payload);
    expect(res.status).toBe(204);
  });

  test('accepts any matching v1 entry and ignores other versions', async () => {
    const payload = envelope('line.offline');
    const msgId = eventId();
    const timestamp = now();
    const good = sign(payload, msgId, timestamp);
    const bad = sign(payload, msgId, timestamp, OTHER_SECRET);
    const res = await send(payload, { msgId, timestamp, signature: `v1a,ignored ${bad} ${good}` });
    expect(res.status).toBe(204);
  });

  test('accepts the old secret while a rotation list is configured', async () => {
    process.env.ISNAP_WEBHOOK_SECRET = `${OTHER_SECRET}, ${TEST_SECRET}`;
    const res = await send(envelope('message.received'));
    expect(res.status).toBe(204);
  });

  test('rejects a missing signature header', async () => {
    const res = await send(envelope('message.received'), {
      headers: { 'webhook-id': 'evt_1', 'webhook-timestamp': now() },
    });
    expect(res.status).toBe(400);
  });

  test('rejects a request with no webhook headers', async () => {
    const res = await send(envelope('message.received'), { headers: {} });
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature with 401, never 410', async () => {
    const res = await send(envelope('message.received'), { signature: 'v1,aW52YWxpZA==' });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another secret', async () => {
    const payload = envelope('message.received');
    const msgId = eventId();
    const timestamp = now();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp, OTHER_SECRET) });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const payload = envelope('message.received');
    const msgId = eventId();
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp);
    const res = await send(envelope('message.failed'), { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a stale timestamp (library window is 5 minutes)', async () => {
    const payload = envelope('message.received');
    const msgId = eventId();
    const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp) });
    expect(res.status).toBe(401);
  });

  test('returns 400 for a verified body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
  });

  test('fails closed when the secret is not configured', async () => {
    delete process.env.ISNAP_WEBHOOK_SECRET;
    const res = await send(envelope('message.received'));
    expect(res.status).toBe(500);
  });

  test('fails closed when the secret is not a whsec_ secret', async () => {
    process.env.ISNAP_WEBHOOK_SECRET = 'not-a-whsec-secret';
    const res = await send(envelope('message.received'));
    expect(res.status).toBe(500);
  });
});
