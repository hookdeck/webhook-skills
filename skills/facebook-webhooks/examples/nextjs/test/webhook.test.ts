import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Set test environment variables before importing the route
beforeAll(() => {
  process.env.FACEBOOK_APP_SECRET = 'test_app_secret';
  process.env.FACEBOOK_VERIFY_TOKEN = 'test_verify_token';
});

import { GET, POST } from '../app/webhooks/facebook/route';

const APP_SECRET = 'test_app_secret';

/**
 * Generate a valid Facebook X-Hub-Signature-256 value for testing.
 */
function generateSignature(payload: string, appSecret: string): string {
  const signature = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}

function postRequest(body: string, signature: string | null): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature !== null) {
    headers['x-hub-signature-256'] = signature;
  }
  return new NextRequest('http://localhost:3000/webhooks/facebook', {
    method: 'POST',
    headers,
    body,
  });
}

describe('GET /webhooks/facebook (verification handshake)', () => {
  it('echoes hub.challenge when mode and verify_token match', async () => {
    const url =
      'http://localhost:3000/webhooks/facebook?hub.mode=subscribe' +
      '&hub.verify_token=test_verify_token&hub.challenge=1234567890';
    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('1234567890');
  });

  it('returns 403 when the verify_token does not match', async () => {
    const url =
      'http://localhost:3000/webhooks/facebook?hub.mode=subscribe' +
      '&hub.verify_token=wrong_token&hub.challenge=1234567890';
    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(403);
  });

  it('returns 403 when mode is not subscribe', async () => {
    const url =
      'http://localhost:3000/webhooks/facebook?hub.mode=unsubscribe' +
      '&hub.verify_token=test_verify_token&hub.challenge=1234567890';
    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(403);
  });
});

describe('POST /webhooks/facebook (event delivery)', () => {
  it('returns 401 for a missing signature', async () => {
    const response = await POST(postRequest('{"object":"page","entry":[]}', null));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const response = await POST(
      postRequest('{"object":"page","entry":[]}', 'sha256=invalid')
    );
    expect(response.status).toBe(401);
  });

  it('returns 200 for a valid page feed event', async () => {
    const payload = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          time: 1458692752,
          changes: [{ field: 'feed', value: { item: 'comment', verb: 'add' } }],
        },
      ],
    });
    const response = await POST(postRequest(payload, generateSignature(payload, APP_SECRET)));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('EVENT_RECEIVED');
  });

  it('handles an instagram comments event', async () => {
    const payload = JSON.stringify({
      object: 'instagram',
      entry: [
        { id: 'ig-1', time: 1, changes: [{ field: 'comments', value: { id: 'c-1' } }] },
      ],
    });
    const response = await POST(postRequest(payload, generateSignature(payload, APP_SECRET)));

    expect(response.status).toBe(200);
  });

  it('handles a Messenger messaging event', async () => {
    const payload = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          time: 1,
          messaging: [{ sender: { id: 'psid-1' }, message: { text: 'Hello' } }],
        },
      ],
    });
    const response = await POST(postRequest(payload, generateSignature(payload, APP_SECRET)));

    expect(response.status).toBe(200);
  });

  it('rejects a tampered payload', async () => {
    const original = JSON.stringify({ object: 'page', entry: [{ id: '1' }] });
    const signature = generateSignature(original, APP_SECRET);
    const tampered = JSON.stringify({ object: 'page', entry: [{ id: '999' }] });

    const response = await POST(postRequest(tampered, signature));
    expect(response.status).toBe(401);
  });
});
