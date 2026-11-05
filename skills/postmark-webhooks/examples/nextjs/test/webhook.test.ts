import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

    it('should reject requests when no token is configured', async () => {
      delete process.env.POSTMARK_WEBHOOK_TOKEN;

      const payload = {
        RecordType: 'Bounce',
        MessageID: 'test',
      };

      const request = createRequest(payload);
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should reject an empty token when the configured token is empty', async () => {
      process.env.POSTMARK_WEBHOOK_TOKEN = '';

      // createRequest omits an empty token, so build the ?token= URL directly
      const request = new NextRequest('http://localhost:3000/webhooks/postmark?token=', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ RecordType: 'Bounce', MessageID: 'test' }),
      });
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
    // Fixtures follow the sample payloads in Postmark's webhook docs. The handlers
    // only log, so these assert on the log lines: a wrong field name logs
    // "undefined" and fails the test even though the response is still 200.
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should handle Bounce events', async () => {
      const bounceEvent = {
        RecordType: 'Bounce',
        MessageStream: 'outbound',
        ID: 692560173,
        Type: 'HardBounce',
        TypeCode: 1,
        Name: 'Hard bounce',
        Tag: 'welcome-email',
        MessageID: '883953f4-6105-42a2-a16a-77a8eac79483',
        Metadata: {
          PropA: 'some value',
          PropB: 'some value',
        },
        ServerID: 23,
        Description: 'The server was unable to deliver your message',
        Details: 'Test bounce details',
        Email: 'user@example.com',
        From: 'sender@example.com',
        BouncedAt: '2026-11-05T16:33:54.9070259Z',
        DumpAvailable: true,
        Inactive: true,
        CanActivate: true,
        Subject: 'Saying Hello!',
      };

      const request = createRequest(bounceEvent, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Bounce: user@example.com');
      expect(console.log).toHaveBeenCalledWith('  Type: HardBounce');
      expect(console.log).toHaveBeenCalledWith('  Bounced at: 2026-11-05T16:33:54.9070259Z');
    });

    it('should handle SpamComplaint events', async () => {
      const spamEvent = {
        RecordType: 'SpamComplaint',
        MessageStream: 'outbound',
        ID: 692560174,
        Type: 'SpamComplaint',
        TypeCode: 100001,
        Name: 'Spam complaint',
        Tag: 'welcome-email',
        MessageID: '883953f4-6105-42a2-a16a-77a8eac79483',
        Metadata: {
          PropA: 'some value',
          PropB: 'some value',
        },
        ServerID: 23,
        Description: 'The subscriber explicitly marked this message as spam.',
        Details: 'Test spam complaint details',
        Email: 'user@example.com',
        From: 'sender@example.com',
        BouncedAt: '2026-11-05T16:33:54.9070259Z',
        DumpAvailable: true,
        Inactive: true,
        CanActivate: false,
        Subject: 'Saying Hello!',
      };

      const request = createRequest(spamEvent, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Spam complaint: user@example.com');
      expect(console.log).toHaveBeenCalledWith('  Complained at: 2026-11-05T16:33:54.9070259Z');
    });

    it('should handle Open events', async () => {
      const openEvent = {
        RecordType: 'Open',
        MessageStream: 'outbound',
        FirstOpen: true,
        Client: {
          Name: 'Chrome 140.0.7339.80',
          Company: 'Google',
          Family: 'Chrome',
        },
        OS: {
          Name: 'macOS 26 Tahoe',
          Company: 'Apple Computer, Inc.',
          Family: 'macOS',
        },
        Platform: 'WebMail',
        UserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36',
        ReadSeconds: 5,
        Geo: {
          CountryISOCode: 'US',
          Country: 'United States',
          City: 'Houston',
          IP: '203.0.113.42',
        },
        MessageID: '883953f4-6105-42a2-a16a-77a8eac79483',
        Metadata: {
          PropA: 'some value',
          PropB: 'some value',
        },
        ReceivedAt: '2026-11-05T16:33:54.9070259Z',
        Tag: 'welcome-email',
        Recipient: 'user@example.com',
      };

      const request = createRequest(openEvent, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Email opened: user@example.com');
      expect(console.log).toHaveBeenCalledWith('  Opened at: 2026-11-05T16:33:54.9070259Z');
      expect(console.log).toHaveBeenCalledWith('  Platform: WebMail');
    });

    it('should handle Click events', async () => {
      const clickEvent = {
        RecordType: 'Click',
        MessageStream: 'outbound',
        ClickLocation: 'HTML',
        Client: {
          Name: 'Chrome 140.0.7339.80',
          Company: 'Google',
          Family: 'Chrome',
        },
        OS: {
          Name: 'macOS 26 Tahoe',
          Company: 'Apple Computer, Inc.',
          Family: 'macOS',
        },
        Platform: 'Desktop',
        UserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36',
        OriginalLink: 'https://example.com/confirm-your-address',
        Geo: {
          CountryISOCode: 'US',
          Country: 'United States',
          City: 'Houston',
          IP: '203.0.113.42',
        },
        MessageID: '883953f4-6105-42a2-a16a-77a8eac79483',
        Metadata: {
          PropA: 'some value',
          PropB: 'some value',
        },
        ReceivedAt: '2026-11-05T16:33:54.9070259Z',
        Tag: 'welcome-email',
        Recipient: 'user@example.com',
      };

      const request = createRequest(clickEvent, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Link clicked: user@example.com');
      expect(console.log).toHaveBeenCalledWith('  Clicked at: 2026-11-05T16:33:54.9070259Z');
      expect(console.log).toHaveBeenCalledWith('  Link: https://example.com/confirm-your-address');
    });

    it('should handle Delivery events', async () => {
      const deliveryEvent = {
        RecordType: 'Delivery',
        MessageStream: 'outbound',
        ServerID: 23,
        MessageID: '883953f4-6105-42a2-a16a-77a8eac79483',
        Recipient: 'user@example.com',
        Tag: 'welcome-email',
        DeliveredAt: '2026-11-05T16:33:54.9070259Z',
        Details: '250 2.0.0 OK',
        Metadata: {
          PropA: 'some value',
          PropB: 'some value',
        },
      };

      const request = createRequest(deliveryEvent, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Email delivered: user@example.com');
      expect(console.log).toHaveBeenCalledWith('  Delivered at: 2026-11-05T16:33:54.9070259Z');
      expect(console.log).toHaveBeenCalledWith('  Server: 23');
    });

    it('should handle SubscriptionChange events', async () => {
      const subscriptionEvent = {
        RecordType: 'SubscriptionChange',
        MessageID: '883953f4-6105-42a2-a16a-77a8eac79483',
        ServerID: 23,
        MessageStream: 'outbound',
        ChangedAt: '2026-11-05T16:33:54.9070259Z',
        Recipient: 'user@example.com',
        Origin: 'Recipient',
        SuppressSending: true,
        SuppressionReason: 'HardBounce',
        Tag: 'welcome-email',
        Metadata: {
          PropA: 'some value',
          PropB: 'some value',
        },
      };

      const request = createRequest(subscriptionEvent, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Subscription change: user@example.com');
      expect(console.log).toHaveBeenCalledWith('  Changed at: 2026-11-05T16:33:54.9070259Z');
      expect(console.log).toHaveBeenCalledWith('  Suppression reason: HardBounce');
    });

    it('should handle Inbound events', async () => {
      const inboundEvent = {
        FromName: 'Sender Name',
        MessageStream: 'inbound',
        From: 'sender@example.com',
        FromFull: {
          Email: 'sender@example.com',
          Name: 'Sender Name',
          MailboxHash: '',
        },
        To: 'yourhash+SampleHash@inbound.postmarkapp.com',
        ToFull: [
          {
            Email: 'yourhash+SampleHash@inbound.postmarkapp.com',
            Name: '',
            MailboxHash: 'SampleHash',
          },
        ],
        OriginalRecipient: 'yourhash+SampleHash@inbound.postmarkapp.com',
        Subject: 'Saying Hello!',
        MessageID: '883953f4-6105-42a2-a16a-77a8eac79483',
        ReplyTo: 'sender@example.com',
        MailboxHash: 'SampleHash',
        Date: 'Thu, 5 Nov 2026 16:33:54 -0500',
        TextBody: 'This is a test text body.',
        HtmlBody: '<html><body><p>This is a test html body.</p></body></html>',
        StrippedTextReply: 'This is the reply text',
        Tag: 'welcome-email',
        Headers: [
          {
            Name: 'X-Spam-Status',
            Value: 'No',
          },
        ],
        Attachments: [],
      };

      const request = createRequest(inboundEvent, validToken);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Inbound email from: sender@example.com');
      expect(console.log).toHaveBeenCalledWith('  Subject: Saying Hello!');
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