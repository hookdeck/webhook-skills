import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyFlagsmithSignature } from '../lib/verify';

const SECRET = 'test_flagsmith_secret';

beforeAll(() => {
  process.env.FLAGSMITH_WEBHOOK_SECRET = SECRET;
});

// Same algorithm as Flagsmith: hex HMAC-SHA256 of the body, keyed with the secret
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

const flagUpdated = JSON.stringify({
  event_type: 'FLAG_UPDATED',
  data: {
    changed_by: 'user@domain.com',
    timestamp: '2021-06-18T07:50:26.595298Z',
    new_state: { enabled: true, feature: { id: 1, name: 'my_feature' } },
    previous_state: { enabled: false, feature: { id: 1, name: 'my_feature' } },
  },
});
const flagDeleted = JSON.stringify({
  event_type: 'FLAG_DELETED',
  data: { feature: { id: 1, name: 'my_feature' } },
});
const auditLog = JSON.stringify({
  event_type: 'AUDIT_LOG_CREATED',
  data: { log: 'New Flag / Remote Config created: my_feature', related_object_type: 'FEATURE' },
});
const identity = JSON.stringify({ identity: 'user_test', flags: [], traits: [], segments: [] });

describe('verifyFlagsmithSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifyFlagsmithSignature(flagUpdated, sign(flagUpdated), SECRET)).toBe(true);
  });

  it('rejects a wrong secret, tampered body, wrong length and empty values', () => {
    expect(verifyFlagsmithSignature(flagUpdated, sign(flagUpdated, 'other'), SECRET)).toBe(false);
    expect(verifyFlagsmithSignature(flagUpdated + ' ', sign(flagUpdated), SECRET)).toBe(false);
    expect(verifyFlagsmithSignature(flagUpdated, 'abc', SECRET)).toBe(false);
    expect(verifyFlagsmithSignature(flagUpdated, null, SECRET)).toBe(false);
    expect(verifyFlagsmithSignature(flagUpdated, sign(flagUpdated), undefined)).toBe(false);
  });
});

describe('POST /webhooks/flagsmith', () => {
  async function post(body: string, signature?: string, contentType = 'application/json') {
    const { POST } = await import('../app/webhooks/flagsmith/route');
    const headers: Record<string, string> = { 'content-type': contentType };
    if (signature !== undefined) headers['x-flagsmith-signature'] = signature;
    const req = new NextRequest('http://localhost/webhooks/flagsmith', { method: 'POST', headers, body });
    return POST(req);
  }

  it.each([
    ['FLAG_UPDATED', flagUpdated],
    ['FLAG_DELETED', flagDeleted],
    ['AUDIT_LOG_CREATED', auditLog],
    ['identity webhook', identity],
  ])('accepts a signed %s payload', async (_name, body) => {
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const res = await post(flagUpdated, sign(flagUpdated), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    expect((await post(flagUpdated)).status).toBe(400);
  });

  it('rejects an invalid signature', async () => {
    expect((await post(flagUpdated, sign(flagUpdated, 'wrong'))).status).toBe(400);
  });

  it('rejects signed invalid JSON', async () => {
    expect((await post('not json', sign('not json'), 'text/plain')).status).toBe(400);
  });
});
