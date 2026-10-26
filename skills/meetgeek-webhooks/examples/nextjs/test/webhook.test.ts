import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'mg_test_secret_key';

// Documented sample payloads
const SUCCESS = JSON.stringify({
  message: 'File analyzed successfully',
  meeting_id: '9433976b-cfa3-4373-9afb-eb0b7a5915df',
});
const FAILED = JSON.stringify({ message: 'File analyzed failed' });

const sign = (body: string, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('hex');

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.MEETGEEK_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/meetgeek/route'));
});

const call = (body: string, headers: Record<string, string> = {}, contentType = 'application/json') =>
  POST(
    new NextRequest('http://localhost/webhooks/meetgeek', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body,
    })
  );

describe('MeetGeek webhook', () => {
  it('accepts a successful-analysis delivery', async () => {
    expect((await call(SUCCESS, { 'x-mg-signature': sign(SUCCESS) })).status).toBe(200);
  });

  it('accepts a failed-analysis delivery', async () => {
    expect((await call(FAILED, { 'x-mg-signature': sign(FAILED) })).status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    expect((await call(SUCCESS, { 'x-mg-signature': sign(SUCCESS).toUpperCase() })).status).toBe(200);
  });

  it('verifies any content type over the exact bytes', async () => {
    expect((await call(SUCCESS, { 'x-mg-signature': sign(SUCCESS) }, 'text/plain')).status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    expect((await call(SUCCESS)).status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    expect((await call(SUCCESS, { 'x-mg-signature': '' })).status).toBe(401);
  });

  it('rejects a malformed signature', async () => {
    expect((await call(SUCCESS, { 'x-mg-signature': 'sha256=' + sign(SUCCESS) })).status).toBe(401);
    expect((await call(SUCCESS, { 'x-mg-signature': 'zz'.repeat(32) })).status).toBe(401);
    expect((await call(SUCCESS, { 'x-mg-signature': sign(SUCCESS).slice(2) })).status).toBe(401);
  });

  it('rejects a signature from the wrong secret', async () => {
    expect((await call(SUCCESS, { 'x-mg-signature': sign(SUCCESS, 'other_secret') })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await call(FAILED, { 'x-mg-signature': sign(SUCCESS) })).status).toBe(401);
  });

  it('returns 400 for a signed non-JSON body', async () => {
    const body = 'not json';
    expect((await call(body, { 'x-mg-signature': sign(body) })).status).toBe(400);
  });
});
