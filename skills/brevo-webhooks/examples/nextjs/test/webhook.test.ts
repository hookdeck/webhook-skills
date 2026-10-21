import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyBrevoAuth, POST } from '../app/webhooks/brevo/route';

const USER = 'brevo_user';
const PASS = 'test_pass:with:colons';
const TOKEN = 'test_bearer_token_123';
const CREDS = { username: USER, password: PASS, token: TOKEN };

beforeEach(() => {
  process.env.BREVO_WEBHOOK_USERNAME = USER;
  process.env.BREVO_WEBHOOK_PASSWORD = PASS;
  process.env.BREVO_WEBHOOK_TOKEN = TOKEN;
});

// Brevo sends URL-embedded credentials as a standard Basic auth header
function basicAuth(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;
  return new NextRequest('http://localhost:3000/webhooks/brevo', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const deliveredEvent = {
  event: 'delivered',
  email: 'example@domain.com',
  id: 26224,
  date: '2020-10-09 00:00:00',
  ts: 1604933619,
  'message-id': '201798300811.5787683@relay.domain.com',
  ts_event: 1604933654,
  subject: 'My first Transactional',
  tags: ['transac_messages'],
};

describe('verifyBrevoAuth', () => {
  it('accepts valid Basic credentials', () => {
    expect(verifyBrevoAuth(basicAuth(USER, PASS), CREDS)).toBe(true);
  });

  it('accepts a valid Bearer token', () => {
    expect(verifyBrevoAuth(`Bearer ${TOKEN}`, CREDS)).toBe(true);
  });

  it('rejects wrong credentials', () => {
    expect(verifyBrevoAuth(basicAuth(USER, 'nope'), CREDS)).toBe(false);
    expect(verifyBrevoAuth(basicAuth('someone', PASS), CREDS)).toBe(false);
    expect(verifyBrevoAuth('Bearer wrong', CREDS)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyBrevoAuth(null, CREDS)).toBe(false);
  });

  it('only accepts configured methods', () => {
    expect(verifyBrevoAuth(basicAuth(USER, PASS), { token: TOKEN })).toBe(false);
    expect(verifyBrevoAuth(`Bearer ${TOKEN}`, { username: USER, password: PASS })).toBe(false);
  });
});

describe('POST /webhooks/brevo', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const res = await POST(makeRequest(deliveredEvent));
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid credentials', async () => {
    expect((await POST(makeRequest(deliveredEvent, basicAuth(USER, 'wrong')))).status).toBe(401);
    expect((await POST(makeRequest(deliveredEvent, 'Bearer wrong'))).status).toBe(401);
  });

  it('returns 200 for valid Basic credentials', async () => {
    const res = await POST(makeRequest(deliveredEvent, basicAuth(USER, PASS)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 200 for a valid Bearer token', async () => {
    const res = await POST(makeRequest(deliveredEvent, `Bearer ${TOKEN}`));
    expect(res.status).toBe(200);
  });

  it('returns 500 when no credentials are configured (fails closed)', async () => {
    delete process.env.BREVO_WEBHOOK_USERNAME;
    delete process.env.BREVO_WEBHOOK_PASSWORD;
    delete process.env.BREVO_WEBHOOK_TOKEN;
    const res = await POST(makeRequest(deliveredEvent, basicAuth(USER, PASS)));
    expect(res.status).toBe(500);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(makeRequest('{not json', basicAuth(USER, PASS)));
    expect(res.status).toBe(400);
  });

  it('accepts a batched array of events', async () => {
    const res = await POST(
      makeRequest([deliveredEvent, { ...deliveredEvent, event: 'opened' }], basicAuth(USER, PASS))
    );
    expect(res.status).toBe(200);
  });

  it('handles transactional, marketing and contact events', async () => {
    const events = [
      'request', 'delivered', 'opened', 'unique_opened', 'click', 'soft_bounce',
      'hard_bounce', 'spam', 'unsubscribed', 'blocked', 'invalid_email', 'deferred',
      'error', 'proxy_open', 'unique_proxy_open', 'unsubscribe', 'list_addition',
      'contact_updated', 'contact_deleted', 'some_future_event',
    ];
    for (const event of events) {
      const res = await POST(makeRequest({ ...deliveredEvent, event }, basicAuth(USER, PASS)));
      expect(res.status).toBe(200);
    }
  });
});
