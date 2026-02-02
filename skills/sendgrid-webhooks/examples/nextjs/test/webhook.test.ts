import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createSign } from 'crypto';
import { POST } from '../app/webhooks/sendgrid/route';

// Test webhook verification key (EC P-256 key for testing)
const testPrivateKey = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgpmQ3zf+bk6YSlk1D
P/KbVCTBI/BWszZDLaxJbhFsgHGhRANCAASLvm+bKJtz2V4nR78IX8A8ZEi3gQXK
96XBzIWdhjkj/ypkZVt/BfmpNG+AL94XiGSjxiV8IcNkDP//EScDI4BX
-----END PRIVATE KEY-----`;

const testPublicKey = `MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEi75vmyibc9leJ0e/CF/APGRIt4EFyvelwcyFnYY5I/8qZGVbfwX5qTRvgC/eF4hko8YlfCHDZAz//xEnAyOAVw==`;

// Mock environment variables
beforeAll(() => {
  vi.stubEnv('SENDGRID_WEBHOOK_VERIFICATION_KEY', testPublicKey);
});

function generateSignature(payload: string, timestamp: string): string {
  const signedContent = timestamp + payload;
  const sign = createSign('sha256');
  sign.update(signedContent);
  return sign.sign(testPrivateKey, 'base64');
}

// Helper to create a mock NextRequest
function createRequest(options: {
  body: any;
  headers?: Record<string, string>;
  method?: string;
}) {
  const { body, headers = {}, method = 'POST' } = options;

  // Convert body to string if it's an object
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);

  return new Request('http://localhost:3000/webhooks/sendgrid', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: bodyString,
  });
}

describe('SendGrid Webhook Handler', () => {
  describe('POST /webhooks/sendgrid', () => {
    it('should accept valid webhook with correct signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const events = [
        {
          email: 'test@example.com',
          timestamp: parseInt(timestamp),
          event: 'delivered',
          sg_event_id: 'test-event-id',
          sg_message_id: 'test-message-id',
        },
      ];
      const payload = JSON.stringify(events);
      const signature = generateSignature(payload, timestamp);

      const request = createRequest({
        body: payload,
        headers: {
          'X-Twilio-Email-Event-Webhook-Signature': signature,
          'X-Twilio-Email-Event-Webhook-Timestamp': timestamp,
        },
      });

      const response = await POST(request as any);
      expect(response.status).toBe(200);
    });

    it('should reject webhook with invalid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const events = [{
        email: 'test@example.com',
        timestamp: parseInt(timestamp),
        event: 'delivered',
      }];
      const payload = JSON.stringify(events);

      const request = createRequest({
        body: payload,
        headers: {
          'X-Twilio-Email-Event-Webhook-Signature': 'invalid-signature',
          'X-Twilio-Email-Event-Webhook-Timestamp': timestamp,
        },
      });

      const response = await POST(request as any);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Invalid signature');
    });

    it('should reject webhook with missing signature header', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const events = [{
        email: 'test@example.com',
        timestamp: parseInt(timestamp),
        event: 'delivered',
      }];

      const request = createRequest({
        body: events,
        headers: {
          'X-Twilio-Email-Event-Webhook-Timestamp': timestamp,
        },
      });

      const response = await POST(request as any);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Missing signature headers');
    });

    it('should reject webhook with missing timestamp header', async () => {
      const events = [{
        email: 'test@example.com',
        timestamp: Date.now(),
        event: 'delivered',
      }];

      const request = createRequest({
        body: events,
        headers: {
          'X-Twilio-Email-Event-Webhook-Signature': 'some-signature',
        },
      });

      const response = await POST(request as any);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Missing signature headers');
    });

    it('should handle multiple events in one webhook', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const events = [
        {
          email: 'user1@example.com',
          timestamp: parseInt(timestamp),
          event: 'delivered',
          sg_event_id: 'event-1',
        },
        {
          email: 'user2@example.com',
          timestamp: parseInt(timestamp),
          event: 'bounce',
          sg_event_id: 'event-2',
          reason: 'Invalid email address',
        },
        {
          email: 'user3@example.com',
          timestamp: parseInt(timestamp),
          event: 'click',
          sg_event_id: 'event-3',
          url: 'https://example.com/link',
        },
      ];
      const payload = JSON.stringify(events);
      const signature = generateSignature(payload, timestamp);

      const request = createRequest({
        body: payload,
        headers: {
          'X-Twilio-Email-Event-Webhook-Signature': signature,
          'X-Twilio-Email-Event-Webhook-Timestamp': timestamp,
        },
      });

      const response = await POST(request as any);
      expect(response.status).toBe(200);
    });

    it('should accept headers in lowercase', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const events = [{
        email: 'test@example.com',
        timestamp: parseInt(timestamp),
        event: 'open',
      }];
      const payload = JSON.stringify(events);
      const signature = generateSignature(payload, timestamp);

      const request = createRequest({
        body: payload,
        headers: {
          'x-twilio-email-event-webhook-signature': signature,
          'x-twilio-email-event-webhook-timestamp': timestamp,
        },
      });

      const response = await POST(request as any);
      expect(response.status).toBe(200);
    });

    it('should handle all event types', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const events = [
        { email: 'test@example.com', timestamp: parseInt(timestamp), event: 'delivered' },
        { email: 'test@example.com', timestamp: parseInt(timestamp), event: 'bounce', reason: 'Invalid' },
        { email: 'test@example.com', timestamp: parseInt(timestamp), event: 'open' },
        { email: 'test@example.com', timestamp: parseInt(timestamp), event: 'click', url: 'https://example.com' },
        { email: 'test@example.com', timestamp: parseInt(timestamp), event: 'spam report' },
        { email: 'test@example.com', timestamp: parseInt(timestamp), event: 'unsubscribe' },
        { email: 'test@example.com', timestamp: parseInt(timestamp), event: 'deferred', reason: 'Mailbox full' },
        { email: 'test@example.com', timestamp: parseInt(timestamp), event: 'dropped', reason: 'Bounced address' },
        { email: 'test@example.com', timestamp: parseInt(timestamp), event: 'processed' },
      ];
      const payload = JSON.stringify(events);
      const signature = generateSignature(payload, timestamp);

      const request = createRequest({
        body: payload,
        headers: {
          'X-Twilio-Email-Event-Webhook-Signature': signature,
          'X-Twilio-Email-Event-Webhook-Timestamp': timestamp,
        },
      });

      const response = await POST(request as any);
      expect(response.status).toBe(200);
    });

    it('should reject invalid JSON payload', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = 'invalid-json';
      const signature = generateSignature(payload, timestamp);

      const request = createRequest({
        body: payload,
        headers: {
          'X-Twilio-Email-Event-Webhook-Signature': signature,
          'X-Twilio-Email-Event-Webhook-Timestamp': timestamp,
        },
      });

      const response = await POST(request as any);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Invalid JSON payload');
    });
  });
});