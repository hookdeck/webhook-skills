import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '../app/webhooks/postmark/route';
import { NextRequest } from 'next/server';

describe('Postmark Webhook Route', () => {
  const validToken = 'test-webhook-token';

  beforeEach(() => {
    process.env.POSTMARK_WEBHOOK_TOKEN = validToken;
    vi.clearAllMocks();
  });

  function createRequest(payload: any, token?: string) {
    const url = token
      ? `http://localhost:3000/webhooks/postmark?token=${token}`
      : 'http://localhost:3000/webhooks/postmark';

    return new NextRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  describe('Authentication', () => {
    it('should accept requests with valid token', async () => {
      const payload = {
        RecordType: 'Bounce',
        MessageID: '883953f4-6105-42a2-a16a-77a8eac79483',
      };

      const request = createRequest(payload, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.received).toBe(true);
    });

    it('should reject requests with invalid token', async () => {
      const payload = {
        RecordType: 'Bounce',
        MessageID: 'test',
      };

      const request = createRequest(payload, 'invalid-token');
      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject requests without token', async () => {
      const payload = {
        RecordType: 'Bounce',
        MessageID: 'test',
      };

      const request = createRequest(payload);
      const response = await POST(request);

      expect(response.status).toBe(401);
    });
  });

  describe('Payload Validation', () => {
    it('should reject payload without RecordType', async () => {
      const request = createRequest({ MessageID: 'test-id' }, validToken);
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid payload structure');
    });

    it('should reject payload without MessageID', async () => {
      const request = createRequest({ RecordType: 'Bounce' }, validToken);
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid payload structure');
    });
  });

  describe('Event Processing', () => {
    it('should handle Bounce events', async () => {
      const bounceEvent = {
        RecordType: 'Bounce',
        MessageID: '883953f4-6105-42a2-a16a-77a8eac79483',
        Type: 'HardBounce',
        Email: 'bounced@example.com',
        Description: 'The email address does not exist',
        Details: 'smtp;550 5.1.1 The email account does not exist',
        BouncedAt: '2024-01-15T10:30:00Z',
        DumpAvailable: true,
        Inactive: true,
        CanActivate: false,
        ServerID: 23,
        MessageStream: 'outbound',
        Tag: 'welcome-email',
        Metadata: {
          user_id: '12345',
        },
      };

      const request = createRequest(bounceEvent, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should handle SpamComplaint events', async () => {
      const spamEvent = {
        RecordType: 'SpamComplaint',
        MessageID: 'test-message-id',
        Email: 'user@example.com',
        BouncedAt: '2024-01-15T10:30:00Z',
        ServerID: 23,
        MessageStream: 'outbound',
      };

      const request = createRequest(spamEvent, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should handle Open events', async () => {
      const openEvent = {
        RecordType: 'Open',
        MessageID: 'test-message-id',
        Email: 'user@example.com',
        ReceivedAt: '2024-01-15T10:30:00Z',
        Platform: 'Gmail',
        UserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ServerID: 23,
      };

      const request = createRequest(openEvent, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should handle Click events', async () => {
      const clickEvent = {
        RecordType: 'Click',
        MessageID: 'test-message-id',
        Email: 'user@example.com',
        ClickedAt: '2024-01-15T10:30:00Z',
        OriginalLink: 'https://example.com/verify',
        ClickLocation: 'HTML',
        Platform: 'Gmail',
        UserAgent: 'Mozilla/5.0',
      };

      const request = createRequest(clickEvent, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should handle Delivery events', async () => {
      const deliveryEvent = {
        RecordType: 'Delivery',
        MessageID: 'test-message-id',
        Email: 'user@example.com',
        DeliveredAt: '2024-01-15T10:30:00Z',
        ServerID: 23,
        Details: 'Test details',
      };

      const request = createRequest(deliveryEvent, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should handle SubscriptionChange events', async () => {
      const subscriptionEvent = {
        RecordType: 'SubscriptionChange',
        MessageID: 'test-message-id',
        Email: 'user@example.com',
        ChangedAt: '2024-01-15T10:30:00Z',
        SuppressionReason: 'ManualSuppression',
      };

      const request = createRequest(subscriptionEvent, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should handle unknown event types gracefully', async () => {
      const unknownEvent = {
        RecordType: 'UnknownType' as any,
        MessageID: 'test-message-id',
      };

      const request = createRequest(unknownEvent, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON parsing errors', async () => {
      const request = new NextRequest(`http://localhost:3000/webhooks/postmark?token=${validToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });

      const response = await POST(request);
      expect(response.status).toBe(500);
    });
  });
});