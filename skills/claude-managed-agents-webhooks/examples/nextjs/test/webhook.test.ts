import { describe, it, expect } from 'vitest';
import { POST } from '../app/webhooks/claude-managed-agents/route';
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

/**
 * Generate a valid Standard Webhooks signature for testing.
 */
function generateSignature(
  payload: string,
  secret: string,
  webhookId: string,
  webhookTimestamp: string
): string {
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;
  const signature = createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  return `v1,${signature}`;
}

function createTestRequest(payload: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/claude-managed-agents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: payload,
  });
}

describe('Claude Managed Agents Webhook Endpoint', () => {
  const secret = process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY!;

  describe('POST /webhooks/claude-managed-agents', () => {
    it('returns 400 when signature headers are missing', async () => {
      const request = createTestRequest('{}');
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid signature');
    });

    it('returns 400 for malformed signature header', async () => {
      const payload = JSON.stringify({
        type: 'event',
        id: 'event_test_123',
        data: { type: 'session.status_idled', id: 'sesn_ABC123' },
      });

      const request = createTestRequest(payload, {
        'webhook-id': 'msg_test123',
        'webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
        'webhook-signature': 'not_in_v1_format',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid signature');
    });

    it('returns 400 for an expired timestamp (>5 minutes)', async () => {
      const payload = JSON.stringify({
        type: 'event',
        id: 'event_test_123',
        data: { type: 'session.status_idled', id: 'sesn_ABC123' },
      });

      const webhookId = 'msg_test123';
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
      const signature = generateSignature(payload, secret, webhookId, oldTimestamp);

      const request = createTestRequest(payload, {
        'webhook-id': webhookId,
        'webhook-timestamp': oldTimestamp,
        'webhook-signature': signature,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid signature');
    });

    it('returns 400 for a forged signature', async () => {
      const payload = JSON.stringify({
        type: 'event',
        id: 'event_test_123',
        data: { type: 'session.status_idled', id: 'sesn_ABC123' },
      });

      const request = createTestRequest(payload, {
        'webhook-id': 'msg_test123',
        'webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
        'webhook-signature': 'v1,forged_signature_value',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid signature');
    });

    it('returns 400 when the payload was tampered with after signing', async () => {
      const original = JSON.stringify({
        type: 'event',
        id: 'event_test_123',
        data: { type: 'session.status_idled', id: 'sesn_ORIGINAL' },
      });

      const webhookId = 'msg_test123';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateSignature(original, secret, webhookId, webhookTimestamp);

      const tampered = JSON.stringify({
        type: 'event',
        id: 'event_test_123',
        data: { type: 'session.status_idled', id: 'sesn_TAMPERED' },
      });

      const request = createTestRequest(tampered, {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': signature,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid signature');
    });

    it('returns 500 when the signing key is not configured', async () => {
      const original = process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY;
      delete process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY;

      const request = createTestRequest('{}');
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('Webhook signing key not configured');

      process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY = original;
    });

    it('returns 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        type: 'event',
        id: 'event_test_valid',
        created_at: '2026-03-18T14:05:22Z',
        data: {
          type: 'session.status_idled',
          id: 'sesn_01XYZ',
          organization_id: '8a3d2f1e-aaaa-bbbb-cccc-ddddeeeeffff',
          workspace_id: 'c7b0e4d9-0000-1111-2222-333344445555',
        },
      });

      const webhookId = 'msg_test123';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateSignature(payload, secret, webhookId, webhookTimestamp);

      const request = createTestRequest(payload, {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': signature,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ received: true });
    });

    const eventTypes = [
      'session.status_run_started',
      'session.status_idled',
      'session.status_rescheduled',
      'session.status_terminated',
      'session.thread_created',
      'session.thread_idled',
      'session.thread_terminated',
      'session.outcome_evaluation_ended',
      'vault.created',
      'vault.archived',
      'vault.deleted',
      'vault_credential.created',
      'vault_credential.archived',
      'vault_credential.deleted',
      'vault_credential.refresh_failed',
    ];

    eventTypes.forEach((eventType) => {
      it(`handles ${eventType}`, async () => {
        const payload = JSON.stringify({
          type: 'event',
          id: `event_test_${eventType}`,
          created_at: new Date().toISOString(),
          data: { type: eventType, id: 'resource_123' },
        });

        const webhookId = `msg_${eventType}`;
        const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
        const signature = generateSignature(payload, secret, webhookId, webhookTimestamp);

        const request = createTestRequest(payload, {
          'webhook-id': webhookId,
          'webhook-timestamp': webhookTimestamp,
          'webhook-signature': signature,
        });

        const response = await POST(request);
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json).toEqual({ received: true });
      });
    });

    it('handles an unrecognised event type gracefully', async () => {
      const payload = JSON.stringify({
        type: 'event',
        id: 'event_test_unknown',
        data: { type: 'session.status_future_event', id: 'sesn_X' },
      });

      const webhookId = 'msg_unknown';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateSignature(payload, secret, webhookId, webhookTimestamp);

      const request = createTestRequest(payload, {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': signature,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ received: true });
    });

    it('accepts case-insensitive headers', async () => {
      const payload = JSON.stringify({
        type: 'event',
        id: 'event_test_case',
        data: { type: 'session.status_idled', id: 'sesn_ABC123' },
      });

      const webhookId = 'msg_case';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateSignature(payload, secret, webhookId, webhookTimestamp);

      const request = createTestRequest(payload, {
        'Webhook-Id': webhookId,
        'WEBHOOK-TIMESTAMP': webhookTimestamp,
        'webhook-signature': signature,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ received: true });
    });

    it('accepts a multi-signature header (rotation)', async () => {
      const payload = JSON.stringify({
        type: 'event',
        id: 'event_test_rotation',
        data: { type: 'session.status_idled', id: 'sesn_ABC123' },
      });

      const webhookId = 'msg_rotation';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const validSignature = generateSignature(payload, secret, webhookId, webhookTimestamp);
      const multiSignature = `v1,bogus_signature ${validSignature}`;

      const request = createTestRequest(payload, {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': multiSignature,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ received: true });
    });

    it('returns 400 for malformed JSON', async () => {
      const malformed = '{invalid json';

      const webhookId = 'msg_malformed';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateSignature(malformed, secret, webhookId, webhookTimestamp);

      const request = createTestRequest(malformed, {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': signature,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid JSON payload');
    });
  });
});
