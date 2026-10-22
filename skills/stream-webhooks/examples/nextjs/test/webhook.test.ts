import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import zlib from 'zlib';
import { NextRequest } from 'next/server';

// Stream API secrets are opaque strings used as-is (UTF-8) as the HMAC key
const secret = 'test_stream_api_secret_0123456789abcdefghijklmnopqrstuvwxyz';
const apiKey = 'a1b23cdefgh4';

let POST: (req: NextRequest) => Promise<Response>;
let verifyStreamWebhook: typeof import('../lib/stream').verifyStreamWebhook;

beforeAll(async () => {
  process.env.STREAM_API_SECRET = secret;
  process.env.STREAM_API_KEY = apiKey;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/stream/route'));
  ({ verifyStreamWebhook } = await import('../lib/stream'));
});

/** Generate a valid Stream signature: hex HMAC-SHA256 of the body */
function sign(body: string | Buffer, key = secret): string {
  return crypto.createHmac('sha256', key).update(body).digest('hex');
}

function makeRequest(
  body: string | Buffer,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/stream', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, ...headers },
    body: new Uint8Array(typeof body === 'string' ? Buffer.from(body) : body),
  });
}

const payload = JSON.stringify({
  type: 'message.new',
  cid: 'messaging:general',
  message: { id: 'm1', text: 'hello' },
});

describe('verifyStreamWebhook', () => {
  it('accepts a valid signature', () => {
    expect(verifyStreamWebhook(payload, sign(payload), secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyStreamWebhook(payload, 'deadbeef', secret)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyStreamWebhook(payload, null, secret)).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    expect(verifyStreamWebhook(payload, sign(payload, 'other'), secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyStreamWebhook(payload + ' ', sign(payload), secret)).toBe(false);
  });
});

describe('POST /webhooks/stream', () => {
  it('accepts a valid webhook', async () => {
    const res = await POST(
      makeRequest(payload, {
        'content-type': 'application/json',
        'x-signature': sign(payload),
        'x-webhook-id': '123e4567-e89b-12d3-a456-426614174000',
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const res = await POST(
      makeRequest(payload, { 'content-type': 'text/plain', 'x-signature': sign(payload) })
    );
    expect(res.status).toBe(200);
  });

  it.each([
    'message.new',
    'message.updated',
    'message.deleted',
    'reaction.new',
    'channel.created',
    'user.updated',
    'member.added',
    'some.future_event',
  ])('handles %s', async (type) => {
    const body = JSON.stringify({ type, cid: 'messaging:general' });
    const res = await POST(makeRequest(body, { 'x-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(makeRequest(payload, { 'x-signature': 'bad' }));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature', async () => {
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(400);
  });

  it('rejects a mismatched X-Api-Key', async () => {
    const res = await POST(
      makeRequest(payload, { 'x-signature': sign(payload), 'x-api-key': 'someone_else' })
    );
    expect(res.status).toBe(400);
  });

  it('verifies a gzip body against the uncompressed bytes', async () => {
    const gz = zlib.gzipSync(Buffer.from(payload));
    const res = await POST(
      makeRequest(gz, { 'content-encoding': 'gzip', 'x-signature': sign(payload) })
    );
    expect(res.status).toBe(200);
  });

  it('rejects a gzip body signed over the compressed bytes', async () => {
    const gz = zlib.gzipSync(Buffer.from(payload));
    const res = await POST(
      makeRequest(gz, { 'content-encoding': 'gzip', 'x-signature': sign(gz) })
    );
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON with a valid signature', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-signature': sign(body) }));
    expect(res.status).toBe(400);
  });
});
