import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/vanta/route';

// Vanta (Svix) secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Same algorithm Vanta uses: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

function send(
  payload: string,
  opts: { msgId?: string; timestamp?: string; signature?: string; headers?: Record<string, string> } = {}
) {
  const msgId = opts.msgId ?? `msg_${crypto.randomBytes(12).toString('hex')}`;
  const timestamp = opts.timestamp ?? now();
  const headers = opts.headers ?? {
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': opts.signature ?? sign(payload, msgId, timestamp),
  };
  return POST(
    new Request('http://localhost:3000/webhooks/vanta', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: payload,
    })
  );
}

describe('Vanta webhook handler', () => {
  beforeEach(() => {
    process.env.VANTA_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('accepts a valid payload-only body and routes on its domain', async () => {
    const res = await send(JSON.stringify({ questionnaire: { id: '123', status: 'COMPLETE' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: null, domain: 'questionnaire' });
  });

  test.each([
    ['v1.questionnaire.status-changed', { questionnaire: { id: '123', status: 'COMPLETE' } }, 'questionnaire'],
    ['v1.questionnaire.export-completed', { questionnaire: { id: '507f' }, export: { id: '6a7b', format: 'original' } }, 'questionnaire'],
    ['v1.vendor.decision.created', { vendor: { id: '123', decision: { status: 'APPROVED' } } }, 'vendor'],
    ['v1.trust-center.access-request.received', { trustCenter: { slugId: '123' }, accessRequest: { id: '123' } }, 'trustCenter'],
    ['v1.trust-center.access-request.approved', { trustCenter: { slugId: '123' }, accessRequest: { id: '123' }, viewer: { id: '123' } }, 'trustCenter'],
    ['v1.evidence.status-changed', { evidence: { id: '8f9e', auditId: '5f8d', oldStatus: 'NOT_READY_FOR_AUDIT', newStatus: 'READY_FOR_AUDIT' } }, 'evidence'],
  ])('handles enveloped %s', async (type, data, domain) => {
    const res = await send(JSON.stringify({ type, payload: data }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type, domain });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ type: 'v1.something.new', payload: {} }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('v1.something.new');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ vendor: { id: '123' } });
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
    const res = await send('{"vendor":{"id":"123"}}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"vendor":{"id":"123"}}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"vendor":{"id":"123"}}', msgId, timestamp);
    const res = await send('{"vendor":{"id":"456"}}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"vendor":{"id":"123"}}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.VANTA_WEBHOOK_SECRET;
    const res = await send('{"vendor":{"id":"123"}}');
    expect(res.status).toBe(500);
  });
});
