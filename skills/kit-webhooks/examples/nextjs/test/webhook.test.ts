import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyKitWebhook } from '../lib/kit';

// Kit secrets start with whsec_ but are used WHOLE as UTF-8 key bytes (no base64 decoding)
const SECRET = 'whsec_9f8a1c2d3e4f5a6b7c8d9e0f1a2b3c4d';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.KIT_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/kit/route'));
});

function v1(body: string, secret: string | Buffer, t: number): string {
  return crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
}

function sign(body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${v1(body, secret, t)}`;
}

const subscriber = {
  id: 987654,
  first_name: 'Ada',
  email_address: 'ada@example.com',
  state: 'active',
  created_at: '2026-07-29T14:32:10Z',
  fields: {},
};

const event = (type: string, data: Record<string, unknown> = { subscriber }) => ({
  id: '9c2e1f3a-6b7d-4e8f-a1b2-c3d4e5f60718',
  type,
  created: '2026-07-29T14:32:10Z',
  data,
});

const delivery = (...events: unknown[]) => JSON.stringify({ delivery_id: 123456, events });

function makeRequest(body: string, header?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (header) headers['x-kit-signature'] = header;
  return new NextRequest('http://localhost:3000/webhooks/kit', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyKitWebhook', () => {
  const body = delivery(event('subscriber.created'));

  it('accepts a valid signature', () => {
    expect(verifyKitWebhook(body, sign(body), SECRET)).toBe(true);
  });

  it('uses the whole whsec_ secret, not a stripped or base64-decoded one', () => {
    const stripped = SECRET.slice('whsec_'.length);
    const t = Math.floor(Date.now() / 1000);
    expect(verifyKitWebhook(body, sign(body, stripped), SECRET)).toBe(false);
    const viaDecoded = v1(body, Buffer.from(stripped, 'base64'), t);
    expect(verifyKitWebhook(body, `t=${t},v1=${viaDecoded}`, SECRET)).toBe(false);
  });

  it('rejects wrong secret', () => {
    expect(verifyKitWebhook(body, sign(body, 'whsec_other'), SECRET)).toBe(false);
  });

  it('rejects tampered body', () => {
    expect(verifyKitWebhook(body + ' ', sign(body), SECRET)).toBe(false);
  });

  it('rejects a tampered timestamp', () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyKitWebhook(body, `t=${t + 1},v1=${v1(body, SECRET, t)}`, SECRET)).toBe(false);
  });

  it('accepts an old timestamp by default (retries keep the original t)', () => {
    delete process.env.KIT_TIMESTAMP_TOLERANCE_SECONDS;
    const old = Math.floor(Date.now() / 1000) - 86400;
    expect(verifyKitWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
  });

  it('rejects an old timestamp with an explicit tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyKitWebhook(body, sign(body, SECRET, old), SECRET, 300)).toBe(false);
  });

  it('rejects an old timestamp when KIT_TIMESTAMP_TOLERANCE_SECONDS is set', () => {
    process.env.KIT_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyKitWebhook(body, sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.KIT_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric KIT_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', () => {
    process.env.KIT_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyKitWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
    } finally {
      delete process.env.KIT_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  it('rejects malformed headers', () => {
    expect(verifyKitWebhook(body, 'garbage', SECRET)).toBe(false);
    expect(verifyKitWebhook(body, 't=abc,v1=00', SECRET)).toBe(false);
    expect(verifyKitWebhook(body, `t=${Math.floor(Date.now() / 1000)}`, SECRET)).toBe(false);
    expect(verifyKitWebhook(body, null, SECRET)).toBe(false);
  });

  it('accepts when any v1 signature matches (secret rotation)', () => {
    const t = Math.floor(Date.now() / 1000);
    const header = `t=${t},v1=${v1(body, SECRET, t)},v1=${v1(body, 'whsec_previous_secret', t)}`;
    expect(verifyKitWebhook(body, header, SECRET)).toBe(true);
    expect(verifyKitWebhook(body, header, 'whsec_previous_secret')).toBe(true);
    expect(verifyKitWebhook(body, `${sign(body)},v1=deadbeef`, SECRET)).toBe(true);
  });

  it('tolerates spaces after commas in the header', () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyKitWebhook(body, `t=${t}, v1=${v1(body, SECRET, t)}`, SECRET)).toBe(true);
  });
});

describe('POST /webhooks/kit', () => {
  it('returns 200 for a valid delivery with several event types', async () => {
    for (const [type, extra] of [
      ['subscriber.created', {}],
      ['subscriber.activated', {}],
      ['subscriber.unsubscribed', {}],
      ['subscriber.bounced', {}],
      ['subscriber.complained', {}],
      ['subscriber.subscribed_to_form', { form: { id: 55, name: 'Newsletter signup' } }],
      ['subscriber.tag_added', { tag: { id: 42, name: 'customer' } }],
      ['subscriber.tag_removed', { tag: { id: 42, name: 'customer' } }],
      ['broadcast.sent', {}],
    ] as const) {
      const body = delivery(event(type, { subscriber, ...extra }));
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
    }
  });

  it('returns 200 for a batched delivery', async () => {
    const body = delivery(event('subscriber.created'), { ...event('subscriber.created'), id: 'b1' });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('verifies any content type (raw body)', async () => {
    const body = delivery(event('subscriber.created'));
    const res = await POST(makeRequest(body, sign(body), 'application/vnd.kit+json'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = delivery(event('subscriber.created'));
    const res = await POST(makeRequest(body, sign(body, 'whsec_wrong')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing header', async () => {
    const res = await POST(makeRequest(delivery(event('subscriber.created'))));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed body without an events array', async () => {
    const body = JSON.stringify({ type: 'subscriber.created' });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });

  it('returns 400 for validly signed invalid JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });
});
