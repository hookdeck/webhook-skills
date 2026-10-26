import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/glean/route';

// Glean signing secrets are 'whsec_' + base64(key).
// base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// base64(HMAC_SHA256(base64Decode(secret after whsec_), `${id}.${timestamp}.${payload}`))
function sign(payload: string, timestamp: string, msgId: string): string {
  const key = Buffer.from(TEST_SECRET.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

const event = {
  version: '1',
  trigger_id: 'spec-7d2f1a8b3c9e0546',
  datasource: 'GOOGLECALENDAR',
  doc_type: 'event',
  event_type: 'CONTENT_SCHEDULE',
  title: 'Platform weekly',
  view_url: 'https://www.google.com/calendar/event?eid=abc',
  event_time: '2026-08-25T18:30:00Z',
  time_offset_seconds: 1800,
};

function makeRequest(opts: {
  body?: string;
  ts?: string;
  id?: string;
  signature?: string;
  headers?: Record<string, string>;
} = {}): Request {
  const body = opts.body ?? JSON.stringify(event);
  const ts = opts.ts ?? Math.floor(Date.now() / 1000).toString();
  const id = opts.id ?? 'msg_' + crypto.randomBytes(8).toString('hex');
  return new Request('http://localhost/webhooks/glean', {
    method: 'POST',
    headers: {
      'content-type': 'text/plain',
      'webhook-id': id,
      'webhook-timestamp': ts,
      'webhook-signature': opts.signature ?? sign(body, ts, id),
      ...opts.headers,
    },
    body,
  });
}

describe('Glean webhook route', () => {
  beforeEach(() => {
    process.env.GLEAN_SIGNING_SECRET = TEST_SECRET;
    delete process.env.GLEAN_DELIVERY_BEARER;
  });
  afterEach(() => {
    delete process.env.GLEAN_DELIVERY_BEARER;
  });

  it('processes a valid CONTENT_SCHEDULE delivery (any content type)', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, event_type: 'CONTENT_SCHEDULE' });
  });

  it('accepts several space-delimited signatures', async () => {
    const body = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000).toString();
    const res = await POST(makeRequest({ body, ts, id: 'msg_multi', signature: `v1,aW52YWxpZA== ${sign(body, ts, 'msg_multi')}` }));
    expect(res.status).toBe(200);
  });

  it('handles unknown event types', async () => {
    const res = await POST(makeRequest({ body: JSON.stringify({ ...event, event_type: 'OTHER' }) }));
    expect(res.status).toBe(200);
    expect((await res.json()).event_type).toBe('OTHER');
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(makeRequest({ signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = sign(JSON.stringify(event), ts, 'msg_t');
    const res = await POST(makeRequest({ body: JSON.stringify({ ...event, title: 'x' }), ts, id: 'msg_t', signature }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than 5 minutes (library window)', async () => {
    const res = await POST(makeRequest({ ts: (Math.floor(Date.now() / 1000) - 600).toString() }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  it('rejects missing headers', async () => {
    const res = await POST(new Request('http://localhost/webhooks/glean', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(400);
  });

  it('checks the bearer credential when configured', async () => {
    process.env.GLEAN_DELIVERY_BEARER = 'delivery-secret';
    expect((await POST(makeRequest({ headers: { authorization: 'Bearer nope' } }))).status).toBe(401);
    expect((await POST(makeRequest({ headers: { authorization: 'Bearer delivery-secret' } }))).status).toBe(200);
  });
});
