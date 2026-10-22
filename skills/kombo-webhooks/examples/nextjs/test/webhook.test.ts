import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';

// Kombo Webhook Secret: an arbitrary string used as its UTF-8 bytes (not decoded)
const SECRET = 'test_kombo_webhook_secret';

// Sign like Kombo: JSON with two-space indentation, HMAC-SHA256, base64url without padding
function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('base64url');
}

function payload(type: string, data: unknown): string {
  return JSON.stringify({ id: '5gjAtURLPbnTiwgkaBfiA3WJ', type, data }, null, 2);
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/kombo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

let POST: (req: NextRequest) => Promise<Response>;
let verifyKomboWebhook: typeof import('../lib/verify').verifyKomboWebhook;

beforeAll(async () => {
  process.env.KOMBO_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/kombo/route'));
  ({ verifyKomboWebhook } = await import('../lib/verify'));
});

describe('verifyKomboWebhook', () => {
  const body = payload('data-changed', { integration_id: 'bombohr:ats-dev' });

  it('accepts a valid signature', () => {
    expect(verifyKomboWebhook(body, sign(body), SECRET)).toBe(true);
  });

  it('signature is unpadded base64url', () => {
    expect(sign(body)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects wrong secret, missing header, garbage, and short signatures', () => {
    expect(verifyKomboWebhook(body, sign(body, 'other'), SECRET)).toBe(false);
    expect(verifyKomboWebhook(body, undefined, SECRET)).toBe(false);
    expect(verifyKomboWebhook(body, '!!!not-base64!!!', SECRET)).toBe(false);
    expect(verifyKomboWebhook(body, 'abc', SECRET)).toBe(false);
  });

  it('rejects a compact re-serialization of the body', () => {
    const compact = JSON.stringify(JSON.parse(body));
    expect(verifyKomboWebhook(compact, sign(body), SECRET)).toBe(false);
  });
});

describe('POST /webhooks/kombo', () => {
  const events: Array<[string, unknown]> = [
    ['data-changed', { integration_id: 'bombohr:ats-dev', changed_models: [{ name: 'ats_applications' }] }],
    ['sync-finished', { sync_id: 'B89SCXXho7Yw8PGo8AKJxLn4', sync_state: 'SUCCEEDED' }],
    ['integration-created', { id: 'personio:CBNMt7dSNCzBdnRTx87dev4E', tool: 'personio', category: 'HRIS' }],
    ['integration-deleted', { id: 'personio:CBNMt7dSNCzBdnRTx87dev4E' }],
    ['integration-state-changed', { integration_id: 'personio:CBNMt7dSNCzBdnRTx87dev4E', state: 'INVALID' }],
    ['connection-flow-failed', { integration_tool: 'personio', log_url: 'https://app.kombo.dev/logs/1' }],
    ['issue-status-changed', { change: 'raised', issue: { type: 'integration.authentication_failed' } }],
    ['assessment:order-received', { id: 'B5KQKhAgTv6ZwzrfAbqbhipd', package_id: 'typescript_test' }],
    ['some-future-event', {}],
  ];

  it.each(events)('returns 200 for %s with a valid signature', async (type, data) => {
    const body = payload(type, data);
    const res = await POST(makeRequest(body, { 'x-kombo-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of Content-Type', async () => {
    const body = payload('data-changed', {});
    const res = await POST(makeRequest(body, { 'content-type': 'text/plain', 'x-kombo-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = payload('data-changed', {});
    const res = await POST(makeRequest(body, { 'x-kombo-signature': sign(body, 'wrong_secret') }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(payload('data-changed', {})));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body was tampered with', async () => {
    const body = payload('data-changed', { integration_id: 'a' });
    const res = await POST(makeRequest(body.replace('"a"', '"b"'), { 'x-kombo-signature': sign(body) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-kombo-signature': sign(body) }));
    expect(res.status).toBe(400);
  });
});
