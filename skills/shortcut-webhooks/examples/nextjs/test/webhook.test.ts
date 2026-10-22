import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyShortcutWebhook } from '../lib/verify';
import { POST } from '../app/webhooks/shortcut/route';

const TEST_SECRET = 'test_shortcut_secret';

beforeAll(() => {
  process.env.SHORTCUT_WEBHOOK_SECRET = TEST_SECRET;
});

// Shortcut signs the raw body with HMAC-SHA256 and sends the hex digest
function sign(body: string, secret = TEST_SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeEvent(actions: object[]): string {
  return JSON.stringify({
    id: '595285dc-9c43-4b9c-a1e6-0cd9aff5b084',
    changed_at: '2017-06-27T16:20:44Z',
    primary_id: 16927,
    member_id: '56d8a839-1c52-437f-b981-c3a15a11d6d4',
    version: 'v1',
    actions,
    references: [],
  });
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature) headers['payload-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/shortcut', {
    method: 'POST',
    headers,
    body,
  });
}

const storyUpdate = makeEvent([
  {
    id: 16927,
    entity_type: 'story',
    action: 'update',
    name: 'test story',
    changes: { workflow_state_id: { new: 1495, old: 1493 } },
  },
]);

describe('verifyShortcutWebhook', () => {
  it('accepts a valid signature', () => {
    expect(verifyShortcutWebhook(storyUpdate, sign(storyUpdate), TEST_SECRET)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyShortcutWebhook(storyUpdate, sign(storyUpdate, 'other'), TEST_SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyShortcutWebhook(storyUpdate + ' ', sign(storyUpdate), TEST_SECRET)).toBe(false);
  });

  it('rejects missing, empty, malformed and wrong-length signatures', () => {
    expect(verifyShortcutWebhook(storyUpdate, null, TEST_SECRET)).toBe(false);
    expect(verifyShortcutWebhook(storyUpdate, '', TEST_SECRET)).toBe(false);
    expect(verifyShortcutWebhook(storyUpdate, 'not-hex', TEST_SECRET)).toBe(false);
    expect(verifyShortcutWebhook(storyUpdate, 'abcd', TEST_SECRET)).toBe(false);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifyShortcutWebhook(storyUpdate, sign(storyUpdate).toUpperCase(), TEST_SECRET)).toBe(true);
  });
});

describe('POST /webhooks/shortcut', () => {
  it('returns 200 for a valid story update', async () => {
    const res = await POST(makeRequest(storyUpdate, sign(storyUpdate)));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const res = await POST(makeRequest(storyUpdate, sign(storyUpdate), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it.each(['story create', 'story delete', 'epic update', 'story-comment create', 'label create'])(
    'acknowledges %s',
    async (kind) => {
      const [entity_type, action] = kind.split(' ');
      const body = makeEvent([{ id: 1, entity_type, action, name: 'x', changes: {} }]);
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
    }
  );

  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(storyUpdate));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(storyUpdate, sign(storyUpdate, 'wrong_secret')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(400);
  });
});
