import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_launchdarkly_secret';

beforeAll(() => {
  process.env.LAUNCHDARKLY_WEBHOOK_SECRET = SECRET;
});

// LaunchDarkly: HMAC-SHA256 hex digest of the raw body
function sign(payload: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function entry(kind: string): string {
  return JSON.stringify({
    _id: '57c0a8e29969090743529965',
    date: 1472243938774,
    accesses: [{ action: 'updateOn', resource: 'proj/alexis:env/test' }],
    kind,
    name: 'Testing',
    titleVerb: 'changed the name of',
  });
}

async function post(body: string, signature?: string) {
  const { POST } = await import('../app/webhooks/launchdarkly/route');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['x-ld-signature'] = signature;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/launchdarkly', { method: 'POST', headers, body })
  );
}

describe('verifyLaunchDarklyWebhook', () => {
  it('accepts valid and rejects invalid signatures', async () => {
    const { verifyLaunchDarklyWebhook } = await import('../lib/verify');
    const body = entry('flag');
    expect(verifyLaunchDarklyWebhook(body, sign(body), SECRET)).toBe(true);
    expect(verifyLaunchDarklyWebhook(body, sign(body, 'other'), SECRET)).toBe(false);
    expect(verifyLaunchDarklyWebhook(body, null, SECRET)).toBe(false);
    expect(verifyLaunchDarklyWebhook(body, 'abc', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/launchdarkly', () => {
  for (const kind of ['flag', 'segment', 'project', 'environment', 'member']) {
    it(`accepts signed ${kind} event`, async () => {
      const body = entry(kind);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
    });
  }

  it('rejects an invalid signature', async () => {
    const body = entry('flag');
    expect((await post(body, sign(body, 'wrong'))).status).toBe(400);
  });

  it('rejects an unsigned delivery', async () => {
    expect((await post(entry('flag'))).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = entry('flag');
    expect((await post(body.replace('Testing', 'Hacked'), sign(body))).status).toBe(400);
  });

  it('rejects signed invalid JSON', async () => {
    expect((await post('not json', sign('not json'))).status).toBe(400);
  });
});
