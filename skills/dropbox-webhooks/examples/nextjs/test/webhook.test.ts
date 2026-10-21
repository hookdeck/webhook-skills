import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const APP_SECRET = 'test_app_secret_abc123';

// Dropbox signature: hex HMAC-SHA256 of the raw body keyed with the app secret
function sign(body: string, secret = APP_SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const payload = JSON.stringify({
  list_folder: { accounts: ['dbid:AAH4f99T0taONIb-OurWxbNQ6ywGRopQngc'] },
  delta: { users: [12345678] },
});

let GET: (req: NextRequest) => Promise<Response>;
let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.DROPBOX_APP_SECRET = APP_SECRET;
  ({ GET, POST } = await import('../app/webhooks/dropbox/route'));
});

function post(body: string, signature?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== undefined) headers['x-dropbox-signature'] = signature;
  return POST(new NextRequest('http://localhost/webhooks/dropbox', { method: 'POST', headers, body }));
}

describe('GET /webhooks/dropbox (challenge)', () => {
  it('echoes the challenge as text/plain with nosniff', async () => {
    const res = await GET(new NextRequest('http://localhost/webhooks/dropbox?challenge=abc123'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('abc123');
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects a request without a challenge', async () => {
    const res = await GET(new NextRequest('http://localhost/webhooks/dropbox'));
    expect(res.status).toBe(400);
  });
});

describe('POST /webhooks/dropbox', () => {
  it('accepts a valid signature', async () => {
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await post(payload, sign(payload, 'wrong_secret'));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature', async () => {
    const res = await post(payload);
    expect(res.status).toBe(400);
  });

  it('rejects a signature of the wrong length', async () => {
    const res = await post(payload, 'abc');
    expect(res.status).toBe(400);
  });

  it('rejects a body modified after signing', async () => {
    const res = await post(payload.replace('dbid:AAH4', 'dbid:BBH4'), sign(payload));
    expect(res.status).toBe(400);
  });

  it('rejects signed invalid JSON', async () => {
    const res = await post('not json', sign('not json'));
    expect(res.status).toBe(400);
  });
});
