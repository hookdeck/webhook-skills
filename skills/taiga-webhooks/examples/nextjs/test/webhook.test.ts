import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/taiga/route';

// Taiga's secret key is a free-form string chosen by the project admin
const webhookSecret = 'taiga_test_secret_key';

beforeAll(() => {
  process.env.TAIGA_WEBHOOK_SECRET = webhookSecret;
});

/**
 * Generate an X-TAIGA-WEBHOOK-SIGNATURE value the same way Taiga does:
 * hex(HMAC-SHA1(secret, rawBody))
 */
function generateTaigaSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha1', secret).update(payload).digest('hex');
}

function buildRequest(body: string, signature?: string | null, contentType = 'application/json'): Request {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  const sig = signature === undefined ? generateTaigaSignature(body, webhookSecret) : signature;
  if (sig !== null) {
    headers['X-TAIGA-WEBHOOK-SIGNATURE'] = sig;
  }
  return new Request('http://localhost:3000/webhooks/taiga', {
    method: 'POST',
    headers,
    body,
  });
}

const event = (type: string, action: string, data: object = { id: 139, subject: 'test user story' }) =>
  JSON.stringify({
    action,
    type,
    by: { id: 6, username: 'user1' },
    date: '2016-04-12T12:17:20.486Z',
    data,
    ...(action === 'change' ? { change: { comment: '', diff: {} } } : {}),
  });

// verifyTaigaWebhook is private to route.ts (Next.js route files may only export
// handlers and route config), so signature cases are exercised through POST.
describe('X-TAIGA-WEBHOOK-SIGNATURE verification', () => {
  const body = event('userstory', 'create');

  async function statusFor(signature: string | null, payload = body, contentType?: string): Promise<number> {
    return (await POST(buildRequest(payload, signature, contentType))).status;
  }

  it('accepts a valid signature', async () => {
    expect(await statusFor(generateTaigaSignature(body, webhookSecret))).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    expect(await statusFor(generateTaigaSignature(body, webhookSecret).toUpperCase())).toBe(200);
  });

  it('verifies regardless of Content-Type', async () => {
    expect(await statusFor(generateTaigaSignature(body, webhookSecret), body, 'text/plain')).toBe(200);
  });

  it('rejects a signature made with another key', async () => {
    expect(await statusFor(generateTaigaSignature(body, 'other'))).toBe(400);
  });

  it('rejects a body altered after signing', async () => {
    expect(await statusFor(generateTaigaSignature(body, webhookSecret), body.replace('139', '140'))).toBe(400);
  });

  it('rejects a sha1= prefixed value (X-Hub-Signature format)', async () => {
    expect(await statusFor(`sha1=${generateTaigaSignature(body, webhookSecret)}`)).toBe(400);
  });

  it('rejects an HMAC-SHA256 signature', async () => {
    const sig = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
    expect(await statusFor(sig)).toBe(400);
  });

  it('rejects a short signature without throwing', async () => {
    expect(await statusFor('abc')).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    expect(await statusFor(null)).toBe(400);
  });
});

describe('POST /webhooks/taiga', () => {
  it.each([
    ['userstory', 'create'],
    ['userstory', 'change'],
    ['userstory', 'delete'],
    ['task', 'create'],
    ['task', 'change'],
    ['task', 'delete'],
    ['issue', 'create'],
    ['epic', 'change'],
    ['milestone', 'delete'],
    ['wikipage', 'create'],
  ])('accepts %s %s', async (type, action) => {
    const res = await POST(buildRequest(event(type, action)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts the test event', async () => {
    const res = await POST(buildRequest(event('test', 'test', { test: 'test' })));
    expect(res.status).toBe(200);
  });

  it('accepts unknown events with 200', async () => {
    const res = await POST(buildRequest(event('swimlane', 'create')));
    expect(res.status).toBe(200);
  });

  it('rejects a signed body that is not JSON', async () => {
    const res = await POST(buildRequest('not json'));
    expect(res.status).toBe(400);
  });
});
