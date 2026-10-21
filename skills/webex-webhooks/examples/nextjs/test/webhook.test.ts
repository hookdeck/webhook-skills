import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { verifyWebexWebhook, POST } from '../app/webhooks/webex/route';

const SECRET = 'test_webex_webhook_secret';

beforeAll(() => {
  process.env.WEBEX_WEBHOOK_SECRET = SECRET;
});

/**
 * Generate a valid Webex signature for testing.
 * Matches Webex: X-Spark-Signature = hex HMAC-SHA1(rawBody, secret)
 */
function generateWebexSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha1', secret).update(payload).digest('hex');
}

function webexBody(resource: string, event: string, data: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 'Y2lzY29zcGFyazovL3VzL1dFQkhPT0svZjRlNjA1NjA',
    name: 'Test webhook',
    resource,
    event,
    status: 'active',
    data,
  });
}

function makeRequest(body: string, signature?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) headers['X-Spark-Signature'] = signature;
  return new Request('http://localhost/webhooks/webex', {
    method: 'POST',
    headers,
    body,
  }) as unknown as import('next/server').NextRequest;
}

describe('verifyWebexWebhook', () => {
  it('should return true for a valid signature', () => {
    const payload = webexBody('messages', 'created');
    const signature = generateWebexSignature(payload, SECRET);

    expect(verifyWebexWebhook(payload, signature, SECRET)).toBe(true);
  });

  it('should return false for an invalid signature', () => {
    const payload = webexBody('messages', 'created');

    expect(verifyWebexWebhook(payload, 'invalid', SECRET)).toBe(false);
  });

  it('should return false for a tampered body', () => {
    const payload = webexBody('messages', 'created');
    const signature = generateWebexSignature(payload, SECRET);

    expect(verifyWebexWebhook(webexBody('messages', 'deleted'), signature, SECRET)).toBe(false);
  });

  it('should return false for the wrong secret', () => {
    const payload = webexBody('messages', 'created');
    const signature = generateWebexSignature(payload, SECRET);

    expect(verifyWebexWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should return false for a missing signature', () => {
    expect(verifyWebexWebhook(webexBody('messages', 'created'), null, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/webex', () => {
  it('should return 400 for a missing signature', async () => {
    const response = await POST(makeRequest(webexBody('messages', 'created')));

    expect(response.status).toBe(400);
  });

  it('should return 400 for an invalid signature', async () => {
    const response = await POST(makeRequest(webexBody('messages', 'created'), 'invalid'));

    expect(response.status).toBe(400);
  });

  it('should return 200 for a valid messages.created event', async () => {
    const payload = webexBody('messages', 'created', {
      id: 'msg_1',
      roomId: 'room_1',
      personEmail: 'matt@example.com',
    });

    const response = await POST(makeRequest(payload, generateWebexSignature(payload, SECRET)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it.each([
    ['messages', 'deleted'],
    ['memberships', 'created'],
    ['memberships', 'deleted'],
    ['rooms', 'created'],
    ['rooms', 'updated'],
    ['meetings', 'started'],
    ['meetings', 'ended'],
    ['attachmentActions', 'created'],
  ])('should handle %s.%s event', async (resource, event) => {
    const payload = webexBody(resource, event, { id: 'obj_1' });

    const response = await POST(makeRequest(payload, generateWebexSignature(payload, SECRET)));

    expect(response.status).toBe(200);
  });

  it('should acknowledge unhandled events', async () => {
    const payload = webexBody('recordings', 'created', { id: 'rec_1' });

    const response = await POST(makeRequest(payload, generateWebexSignature(payload, SECRET)));

    expect(response.status).toBe(200);
  });

  it('should return 400 for a validly signed non-JSON body', async () => {
    const payload = 'not json';

    const response = await POST(makeRequest(payload, generateWebexSignature(payload, SECRET)));

    expect(response.status).toBe(400);
  });
});
