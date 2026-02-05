import { describe, test, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/cursor/route';
import { NextRequest } from 'next/server';

// Mock environment variables
process.env.CURSOR_WEBHOOK_SECRET = 'test_secret_key';

// Helper to generate valid Cursor webhook signature
function generateSignature(payload: string, secret: string): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}

// Helper to create NextRequest with proper headers
function createRequest(
  payload: string,
  headers: Record<string, string>
): NextRequest {
  const url = 'http://localhost:3000/webhooks/cursor';
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: payload
  });
}

describe('Cursor Webhook Handler', () => {
  const validPayload = {
    event: 'statusChange',
    timestamp: '2024-01-01T12:00:00.000Z',
    id: 'agent_123456',
    status: 'FINISHED',
    source: {
      repository: 'https://github.com/test/repo',
      ref: 'main'
    },
    target: {
      url: 'https://github.com/test/repo/pull/123',
      branchName: 'feature-branch',
      prUrl: 'https://github.com/test/repo/pull/123'
    },
    summary: 'Updated 3 files and fixed linting errors'
  };

  test('accepts valid webhook with correct signature', async () => {
    const payload = JSON.stringify(validPayload);
    const signature = generateSignature(payload, process.env.CURSOR_WEBHOOK_SECRET!);

    const request = createRequest(payload, {
      'X-Webhook-Signature': signature,
      'X-Webhook-ID': 'msg_123456',
      'X-Webhook-Event': 'statusChange',
      'User-Agent': 'Cursor-Agent-Webhook/1.0'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ received: true });
  });

  test('rejects webhook with invalid signature', async () => {
    const payload = JSON.stringify(validPayload);
    const invalidSignature = 'sha256=invalid_signature';

    const request = createRequest(payload, {
      'X-Webhook-Signature': invalidSignature,
      'X-Webhook-ID': 'msg_123456',
      'X-Webhook-Event': 'statusChange'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Invalid signature' });
  });

  test('rejects webhook with missing signature', async () => {
    const payload = JSON.stringify(validPayload);

    const request = createRequest(payload, {
      'X-Webhook-ID': 'msg_123456',
      'X-Webhook-Event': 'statusChange'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Invalid signature' });
  });

  test('rejects webhook with wrong signature format', async () => {
    const payload = JSON.stringify(validPayload);
    const wrongFormatSignature = 'invalid_format_signature';

    const request = createRequest(payload, {
      'X-Webhook-Signature': wrongFormatSignature,
      'X-Webhook-ID': 'msg_123456',
      'X-Webhook-Event': 'statusChange'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Invalid signature' });
  });

  test('handles ERROR status', async () => {
    const errorPayload = {
      ...validPayload,
      status: 'ERROR'
    };
    const payload = JSON.stringify(errorPayload);
    const signature = generateSignature(payload, process.env.CURSOR_WEBHOOK_SECRET!);

    const request = createRequest(payload, {
      'X-Webhook-Signature': signature,
      'X-Webhook-ID': 'msg_123456',
      'X-Webhook-Event': 'statusChange'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ received: true });
  });

  test('rejects invalid JSON payload', async () => {
    const invalidJson = '{"invalid": json}';
    const signature = generateSignature(invalidJson, process.env.CURSOR_WEBHOOK_SECRET!);

    const request = createRequest(invalidJson, {
      'X-Webhook-Signature': signature,
      'X-Webhook-ID': 'msg_123456',
      'X-Webhook-Event': 'statusChange'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid payload' });
  });

  test('handles missing environment variable', async () => {
    // Temporarily remove the secret
    const originalSecret = process.env.CURSOR_WEBHOOK_SECRET;
    delete process.env.CURSOR_WEBHOOK_SECRET;

    const payload = JSON.stringify(validPayload);
    const request = createRequest(payload, {
      'X-Webhook-Signature': 'sha256=any',
      'X-Webhook-ID': 'msg_123456',
      'X-Webhook-Event': 'statusChange'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Server configuration error' });

    // Restore the secret
    process.env.CURSOR_WEBHOOK_SECRET = originalSecret;
  });
});