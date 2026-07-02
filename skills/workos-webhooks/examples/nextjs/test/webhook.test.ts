import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Env vars (WORKOS_API_KEY, WORKOS_WEBHOOK_SECRET) are set in vitest.config.ts
// so they exist before this module — and the route it imports — are loaded.
import { POST } from '../app/webhooks/workos/route';

/**
 * Generate a valid WorkOS signature for testing.
 * Format: "t=<ms timestamp>, v1=<hex HMAC-SHA256 of `${t}.${payload}`>"
 * The timestamp is in MILLISECONDS.
 */
function generateWorkOSSignature(
  payload: string,
  secret: string,
  timestamp: number = Date.now()
): string {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp}, v1=${signature}`;
}

function buildRequest(payload: string, sigHeader?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (sigHeader) headers['workos-signature'] = sigHeader;
  return new NextRequest('http://localhost:3000/webhooks/workos', {
    method: 'POST',
    headers,
    body: payload,
  });
}

const SECRET = 'wh_test_secret';

describe('WorkOS Webhook Handler', () => {
  it('should return 400 for missing signature', async () => {
    const response = await POST(buildRequest('{}'));
    expect(response.status).toBe(400);
  });

  it('should return 400 for invalid signature', async () => {
    const payload = JSON.stringify({
      id: 'event_test',
      event: 'dsync.user.created',
      data: { id: 'directory_user_test' },
    });
    const response = await POST(
      buildRequest(payload, `t=${Date.now()}, v1=invalidsignature`)
    );
    expect(response.status).toBe(400);
  });

  it('should return 400 for tampered payload', async () => {
    const original = JSON.stringify({
      id: 'event_test',
      event: 'dsync.user.created',
      data: { id: 'directory_user_test' },
    });
    const signature = generateWorkOSSignature(original, SECRET);
    const tampered = JSON.stringify({
      id: 'event_test',
      event: 'dsync.user.created',
      data: { id: 'directory_user_tampered' },
    });
    const response = await POST(buildRequest(tampered, signature));
    expect(response.status).toBe(400);
  });

  it('should return 400 for a stale timestamp (replay)', async () => {
    const payload = JSON.stringify({
      id: 'event_test',
      event: 'dsync.user.created',
      data: { id: 'directory_user_test' },
    });
    const stale = Date.now() - 5 * 60 * 1000; // outside 3 min tolerance
    const signature = generateWorkOSSignature(payload, SECRET, stale);
    const response = await POST(buildRequest(payload, signature));
    expect(response.status).toBe(400);
  });

  it('should return 200 for valid signature', async () => {
    const payload = JSON.stringify({
      id: 'event_test_valid',
      event: 'dsync.user.created',
      data: { id: 'directory_user_valid' },
    });
    const signature = generateWorkOSSignature(payload, SECRET);
    const response = await POST(buildRequest(payload, signature));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('should handle different event types', async () => {
    // Data shapes match what the WorkOS SDK expects to deserialize per event.
    const events = [
      { event: 'dsync.user.created', data: { object: 'directory_user', id: 'directory_user_1' } },
      {
        event: 'dsync.group.user_added',
        data: {
          directory_id: 'directory_1',
          user: { object: 'directory_user', id: 'directory_user_1' },
          group: { object: 'directory_group', id: 'directory_group_1' },
        },
      },
      { event: 'connection.activated', data: { object: 'connection', id: 'conn_1' } },
      { event: 'user.created', data: { object: 'user', id: 'user_1' } },
      { event: 'session.created', data: { object: 'session', id: 'session_1' } },
      { event: 'unknown.event.type', data: { id: 'obj_123' } },
    ];

    for (const { event: eventType, data } of events) {
      const payload = JSON.stringify({
        id: `event_${eventType.replace(/\./g, '_')}`,
        event: eventType,
        data,
      });
      const signature = generateWorkOSSignature(payload, SECRET);
      const response = await POST(buildRequest(payload, signature));
      expect(response.status).toBe(200);
    }
  });
});
