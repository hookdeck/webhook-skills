import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Signing keys are used as raw strings (no encoding or prefix)
const SIGNING_KEY = 'test_signing_key';

let POST: (req: NextRequest) => Promise<Response>;
let verifySignalSciencesWebhook: typeof import('../lib/verify').verifySignalSciencesWebhook;

beforeAll(async () => {
  process.env.SIGNAL_SCIENCES_SIGNING_KEY = SIGNING_KEY;
  ({ POST } = await import('../app/webhooks/signal-sciences/route'));
  ({ verifySignalSciencesWebhook } = await import('../lib/verify'));
});

// Same algorithm as Fastly: hex HMAC-SHA256 of the raw JSON body
function sign(payload: string, key = SIGNING_KEY): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function makeEvent(type: string, payload: object = {}): string {
  return JSON.stringify({
    created: '2024-02-09T21:08:21.31644377Z',
    type,
    payload,
    link: 'dashboard link to event',
    workspaceId: 'www.mysite.com',
  });
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== undefined) headers['x-sigsci-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/signal-sciences', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifySignalSciencesWebhook', () => {
  const body = makeEvent('flag');

  it('accepts a valid signature', () => {
    expect(verifySignalSciencesWebhook(body, sign(body), SIGNING_KEY)).toBe(true);
  });

  it('rejects a signature made with another key', () => {
    expect(verifySignalSciencesWebhook(body, sign(body, 'other'), SIGNING_KEY)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifySignalSciencesWebhook(makeEvent('agentAlert'), sign(body), SIGNING_KEY)).toBe(false);
  });

  it('rejects missing or malformed signatures', () => {
    expect(verifySignalSciencesWebhook(body, null, SIGNING_KEY)).toBe(false);
    expect(verifySignalSciencesWebhook(body, 'not-hex', SIGNING_KEY)).toBe(false);
    expect(verifySignalSciencesWebhook(body, 'abcd', SIGNING_KEY)).toBe(false);
  });
});

describe('POST /webhooks/signal-sciences', () => {
  it('returns 400 for a missing signature', async () => {
    const res = await POST(makeRequest(makeEvent('flag')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(makeEvent('flag'), 'a'.repeat(64)));
    expect(res.status).toBe(400);
  });

  it.each(['flag', 'expireFlag', 'agentAlert', 'loggingModeChanged', 'ruleCreated', 'listDeleted'])(
    'returns 200 for a validly signed %s event',
    async (type) => {
      const body = makeEvent(type, { ID: 'abcde123456789', Slug: 'site.example' });
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    }
  );

  it('returns 200 for unhandled event types', async () => {
    const body = makeEvent('customDashboardCreated');
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });
});
