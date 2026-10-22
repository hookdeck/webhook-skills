import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// whsec_ + base64 of 32 bytes (PostHog requires at least 24 decoded bytes)
const SECRET = 'whsec_' + Buffer.from('test_secret_key_32_bytes_long!!!!').toString('base64');

let POST: (req: any) => Promise<Response>;

beforeAll(async () => {
  process.env.POSTHOG_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/posthog/route'));
});

function sign(body: string, opts: { id?: string; timestamp?: number; secret?: string } = {}) {
  const { id = 'msg_test_1', timestamp = Math.floor(Date.now() / 1000), secret = SECRET } = opts;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return { 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${sig}` };
}

function req(body: string, headers: Record<string, string>, contentType = 'application/json') {
  return new Request('http://localhost/webhooks/posthog', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

const pageview = JSON.stringify({
  event: { event: '$pageview', uuid: '0190-abc', distinct_id: 'user_1', properties: { $current_url: 'https://example.com' } },
  person: { id: 'p1' },
});

describe('PostHog webhook route', () => {
  it('accepts a valid signature', async () => {
    const res = await POST(req(pageview, sign(pageview)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const res = await POST(req(pageview, sign(pageview), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('handles $identify and custom events', async () => {
    for (const name of ['$identify', 'signed_up']) {
      const body = JSON.stringify({ event: { event: name, distinct_id: 'u' }, person: {} });
      expect((await POST(req(body, sign(body)))).status).toBe(200);
    }
  });

  it('rejects a tampered body', async () => {
    const res = await POST(req(pageview.replace('user_1', 'user_2'), sign(pageview)));
    expect(res.status).toBe(400);
  });

  it('rejects a wrong secret', async () => {
    const other = 'whsec_' + Buffer.from('another_secret_key_32_bytes_long!').toString('base64');
    const res = await POST(req(pageview, sign(pageview, { secret: other })));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5 minute window', async () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    const res = await POST(req(pageview, sign(pageview, { timestamp: old })));
    expect(res.status).toBe(400);
  });

  it('rejects missing headers', async () => {
    const res = await POST(req(pageview, {}));
    expect(res.status).toBe(400);
  });
});
