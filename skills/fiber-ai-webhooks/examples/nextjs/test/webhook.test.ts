import { describe, test, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/fiber-ai/route';

// Svix secrets are 'whsec_' + base64(key). base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// base64(HMAC_SHA256(base64Decode(secret_after_whsec_), `${id}.${timestamp}.${payload}`))
function sign(payload: string, secret: string, timestamp: string, msgId: string): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

const newId = () => 'msg_' + crypto.randomBytes(16).toString('hex');
const now = () => Math.floor(Date.now() / 1000).toString();

function makeRequest(
  payload: string,
  opts: { id?: string; ts?: string; sig?: string; contentType?: string; omitHeaders?: boolean } = {}
): NextRequest {
  const id = opts.id ?? newId();
  const ts = opts.ts ?? now();
  const headers: Record<string, string> = { 'content-type': opts.contentType ?? 'application/json' };
  if (!opts.omitHeaders) {
    headers['svix-id'] = id;
    headers['svix-timestamp'] = ts;
    headers['svix-signature'] = opts.sig ?? sign(payload, TEST_SECRET, ts, id);
  }
  return new NextRequest('http://localhost:3000/webhooks/fiber-ai', {
    method: 'POST',
    headers,
    body: payload,
  });
}

describe('Fiber AI Webhook Handler', () => {
  beforeAll(() => {
    process.env.FIBER_AI_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each([
    ['reveal.completed', { type: 'reveal.completed', task_id: 'abc123', success: true }],
    ['batch_live_enrich.completed', { type: 'batch_live_enrich.completed', task_id: 't1', completed: 3, failed: 0, not_found: 1, malformed: 0 }],
    ['batch_contact_enrich.completed', { type: 'batch_contact_enrich.completed', task_id: 't2', success: true }],
    ['mosaic.completed', { type: 'mosaic.completed', task_id: 't3', success: true }],
    ['audience.enrichment_completed', { type: 'audience.enrichment_completed', audience_id: 'a1', success: true }],
    ['tracker.signal_detected', { type: 'tracker.signal_detected', eventId: 'e1', occurredAt: '2026-01-01T00:00:00Z' }],
    ['job.changed', { type: 'job.changed', profiles: [{ listId: 'l1' }] }],
  ])('processes a valid %s webhook', async (type, body) => {
    const res = await POST(makeRequest(JSON.stringify(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('recognises job.changed by its profiles array when no type is sent', async () => {
    const res = await POST(makeRequest(JSON.stringify({ profiles: [{ listId: 'l1' }] })));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('job.changed');
  });

  test('verifies a body sent with any content type', async () => {
    const res = await POST(makeRequest(JSON.stringify({ type: 'reveal.completed' }), { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  test('accepts any matching entry in a multi-signature header (rotation)', async () => {
    const payload = JSON.stringify({ type: 'reveal.completed' });
    const id = newId();
    const ts = now();
    const good = sign(payload, TEST_SECRET, ts, id);
    const res = await POST(makeRequest(payload, { id, ts, sig: `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ${good}` }));
    expect(res.status).toBe(200);
  });

  test('returns 200 for unknown event types', async () => {
    const res = await POST(makeRequest(JSON.stringify({ type: 'something.new' })));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('something.new');
  });

  test('rejects an invalid signature', async () => {
    const res = await POST(makeRequest(JSON.stringify({ type: 'reveal.completed' }), { sig: 'v1,invalidsignature' }));
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const id = newId();
    const ts = now();
    const sig = sign(JSON.stringify({ type: 'reveal.completed', task_id: 'a' }), TEST_SECRET, ts, id);
    const res = await POST(makeRequest(JSON.stringify({ type: 'reveal.completed', task_id: 'b' }), { id, ts, sig }));
    expect(res.status).toBe(400);
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const ts = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await POST(makeRequest(JSON.stringify({ type: 'reveal.completed' }), { ts }));
    expect(res.status).toBe(400);
  });

  test('rejects missing headers', async () => {
    const res = await POST(makeRequest(JSON.stringify({ type: 'reveal.completed' }), { omitHeaders: true }));
    expect(res.status).toBe(400);
  });

  test('rejects an invalid JSON body that is correctly signed', async () => {
    const res = await POST(makeRequest('not json'));
    expect(res.status).toBe(400);
  });
});
