import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables before importing the route handler
beforeAll(() => {
  process.env.COMPANYCAM_WEBHOOK_TOKEN = 'test_webhook_token';
});

const token = 'test_webhook_token';

/**
 * Generate a valid CompanyCam signature for testing.
 * Base64(HMAC-SHA1(token, raw body))
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha1', secret).update(Buffer.from(payload, 'utf8')).digest('base64');
}

function event(eventType: string, payload: Record<string, unknown> = { id: '123' }): string {
  return JSON.stringify({
    event_type: eventType,
    created_at: 1661361759,
    payload,
    webhook_id: 42,
  });
}

function makeRequest(body: string, headers: Record<string, string>) {
  return new Request('http://localhost/webhooks/companycam', {
    method: 'POST',
    headers,
    body,
  });
}

async function post(body: string, headers: Record<string, string>) {
  const { POST } = await import('../app/webhooks/companycam/route');
  return POST(makeRequest(body, headers) as any);
}

describe('CompanyCam Webhook Route', () => {
  it('should return 401 for a missing signature', async () => {
    const res = await post(event('photo.created'), { 'Content-Type': 'application/json' });
    expect(res.status).toBe(401);
  });

  it('should return 401 for an invalid signature', async () => {
    const res = await post(event('photo.created'), {
      'Content-Type': 'application/json',
      'X-CompanyCam-Signature': 'invalid',
    });
    expect(res.status).toBe(401);
  });

  it('should return 401 for a signature made with the wrong token', async () => {
    const body = event('photo.created');
    const res = await post(body, {
      'Content-Type': 'application/json',
      'X-CompanyCam-Signature': generateSignature(body, 'other_token'),
    });
    expect(res.status).toBe(401);
  });

  it('should return 401 when the body is tampered with', async () => {
    const signature = generateSignature(event('photo.created'), token);
    const res = await post(event('photo.created', { id: '999' }), {
      'Content-Type': 'application/json',
      'X-CompanyCam-Signature': signature,
    });
    expect(res.status).toBe(401);
  });

  it.each([
    'project.created',
    'project.updated',
    'photo.created',
    'photo.updated',
    'comment.created',
    'document.created',
    'todo_list.completed',
    'task.completed',
  ])('should accept a valid %s event', async (eventType) => {
    const body = event(eventType);
    const res = await post(body, {
      'Content-Type': 'application/json',
      'X-CompanyCam-Signature': generateSignature(body, token),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('should verify regardless of content type', async () => {
    const body = event('photo.created');
    const res = await post(body, {
      'Content-Type': 'text/plain',
      'X-CompanyCam-Signature': generateSignature(body, token),
    });
    expect(res.status).toBe(200);
  });

  it('should accept unknown event types', async () => {
    const body = event('video.created');
    const res = await post(body, {
      'Content-Type': 'application/json',
      'X-CompanyCam-Signature': generateSignature(body, token),
    });
    expect(res.status).toBe(200);
  });

  it('should return 400 for invalid JSON with a valid signature', async () => {
    const body = 'not json';
    const res = await post(body, {
      'Content-Type': 'application/json',
      'X-CompanyCam-Signature': generateSignature(body, token),
    });
    expect(res.status).toBe(400);
  });
});
