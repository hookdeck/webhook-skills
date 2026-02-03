import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Mock environment (SDK client init uses ELEVENLABS_API_KEY or placeholder)
process.env.ELEVENLABS_WEBHOOK_SECRET = 'test_webhook_secret';

// Import the route handler
import { POST } from '../app/webhooks/elevenlabs/route';

/**
 * Generate a test signature matching ElevenLabs format
 */
function generateTestSignature(payload: string, secret: string, timestamp: number | null = null) {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return {
    header: `t=${ts},v0=${signature}`,
    timestamp: ts
  };
}

/**
 * Create a mock NextRequest
 */
function createMockRequest(body: string, headers: Record<string, string>) {
  return {
    text: async () => body,
    headers: new Headers(headers)
  } as any;
}

describe('ElevenLabs Webhook Handler', () => {
  const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET!;

  describe('POST /webhooks/elevenlabs', () => {
    it('should accept valid webhook with correct signature', async () => {
      const payload = JSON.stringify({
        type: 'post_call_transcription',
        data: {
          call_id: 'test_call_123',
          transcript: {
            text: 'Test transcription',
            segments: []
          }
        },
        event_timestamp: new Date().toISOString()
      });

      const { header } = generateTestSignature(payload, webhookSecret);

      const request = createMockRequest(payload, {
        'ElevenLabs-Signature': header,
        'Content-Type': 'application/json'
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('OK');
    });

    it('should reject webhook with invalid signature', async () => {
      const payload = JSON.stringify({
        type: 'post_call_transcription',
        data: { call_id: 'test_call_123' },
        event_timestamp: new Date().toISOString()
      });

      const request = createMockRequest(payload, {
        'ElevenLabs-Signature': 't=123456,v0=invalid_signature',
        'Content-Type': 'application/json'
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject webhook without signature header', async () => {
      const payload = JSON.stringify({
        type: 'post_call_transcription',
        data: { call_id: 'test_call_123' },
        event_timestamp: new Date().toISOString()
      });

      const request = createMockRequest(payload, {
        'Content-Type': 'application/json'
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject webhook with expired timestamp', async () => {
      const payload = JSON.stringify({
        type: 'post_call_transcription',
        data: { call_id: 'test_call_123' },
        event_timestamp: new Date().toISOString()
      });

      // Create signature with timestamp 40 minutes ago
      const oldTimestamp = Math.floor(Date.now() / 1000) - 2400;
      const { header } = generateTestSignature(payload, webhookSecret, oldTimestamp);

      const request = createMockRequest(payload, {
        'ElevenLabs-Signature': header,
        'Content-Type': 'application/json'
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should handle lowercase signature header', async () => {
      const payload = JSON.stringify({
        type: 'voice_removed',
        data: { voice_id: 'test_voice_456' },
        event_timestamp: new Date().toISOString()
      });

      const { header } = generateTestSignature(payload, webhookSecret);

      const request = createMockRequest(payload, {
        'elevenlabs-signature': header, // lowercase header
        'Content-Type': 'application/json'
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should handle multiple signatures in header', async () => {
      const payload = JSON.stringify({
        type: 'voice_removal_notice',
        data: { voice_id: 'test_voice_789' },
        event_timestamp: new Date().toISOString()
      });

      const { header, timestamp } = generateTestSignature(payload, webhookSecret);
      // Add an invalid signature to the header
      const multiSigHeader = `${header},v0=invalid_signature_here`;

      const request = createMockRequest(payload, {
        'ElevenLabs-Signature': multiSigHeader,
        'Content-Type': 'application/json'
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should handle all event types', async () => {
      const eventTypes = [
        'post_call_transcription',
        'voice_removal_notice',
        'voice_removal_notice_withdrawn',
        'voice_removed'
      ];

      for (const eventType of eventTypes) {
        const payload = JSON.stringify({
          type: eventType,
          data: { test_id: `test_${eventType}` },
          event_timestamp: new Date().toISOString()
        });

        const { header } = generateTestSignature(payload, webhookSecret);

        const request = createMockRequest(payload, {
          'ElevenLabs-Signature': header,
          'Content-Type': 'application/json'
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
      }
    });
  });
});