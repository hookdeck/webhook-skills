const request = require('supertest');
const app = require('../src/index');

describe('Postmark Webhook Handler', () => {
  const validToken = 'test-webhook-token';
  process.env.POSTMARK_WEBHOOK_TOKEN = validToken;

  const webhookUrl = `/webhooks/postmark?token=${validToken}`;

  describe('Authentication', () => {
    it('should accept requests with valid token', async () => {
      const payload = {
        RecordType: 'Bounce',
        MessageID: '883953f4-6105-42a2-a16a-77a8eac79483'
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app)
        .post('/webhooks/postmark?token=invalid-token')
        .send({ RecordType: 'Bounce', MessageID: 'test' });

      expect(response.status).toBe(401);
      expect(response.text).toBe('Unauthorized');
    });

    it('should reject requests without token', async () => {
      const response = await request(app)
        .post('/webhooks/postmark')
        .send({ RecordType: 'Bounce', MessageID: 'test' });

      expect(response.status).toBe(401);
    });

    it('should reject requests when no token is configured', async () => {
      const configuredToken = process.env.POSTMARK_WEBHOOK_TOKEN;
      delete process.env.POSTMARK_WEBHOOK_TOKEN;

      try {
        const response = await request(app)
          .post('/webhooks/postmark')
          .send({ RecordType: 'Bounce', MessageID: 'test' });

        expect(response.status).toBe(401);
      } finally {
        process.env.POSTMARK_WEBHOOK_TOKEN = configuredToken;
      }
    });
  });

  describe('Payload Validation', () => {
    it('should reject payload without RecordType', async () => {
      const response = await request(app)
        .post(webhookUrl)
        .send({ MessageID: 'test-id' });

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid payload structure');
    });

    it('should reject payload without MessageID', async () => {
      const response = await request(app)
        .post(webhookUrl)
        .send({ RecordType: 'Bounce' });

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid payload structure');
    });

    // Postmark sends MessageID: null for manual suppressions and reactivations,
    // and drops any event that gets a 4xx
    it('should accept SubscriptionChange with a null MessageID', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const response = await request(app)
        .post(webhookUrl)
        .send({
          RecordType: 'SubscriptionChange',
          MessageID: null,
          ServerID: 23,
          MessageStream: 'outbound',
          ChangedAt: '2026-11-05T16:33:54.9070259Z',
          Recipient: 'user@example.com',
          Origin: 'Customer',
          SuppressSending: true,
          SuppressionReason: 'ManualSuppression'
        });

      expect(response.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Subscription change: user@example.com');
      logSpy.mockRestore();
    });

    it('should accept SubscriptionChange without a MessageID field', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const response = await request(app)
        .post(webhookUrl)
        .send({
          RecordType: 'SubscriptionChange',
          ChangedAt: '2026-11-05T16:33:54.9070259Z',
          Recipient: 'user@example.com',
          SuppressSending: false
        });

      expect(response.status).toBe(200);
      logSpy.mockRestore();
    });

    // Only SubscriptionChange is documented as sending MessageID: null
    it('should reject other event types with a null MessageID', async () => {
      const response = await request(app)
        .post(webhookUrl)
        .send({ RecordType: 'Bounce', MessageID: null });

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid payload structure');
    });
  });

  describe('Event Processing', () => {
    // Fixtures follow the sample payloads in Postmark's webhook docs. The handlers
    // only log, so these assert on the log lines: a wrong field name logs
    // "undefined" and fails the test even though the response is still 200.
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
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
          PropB: 'some value'
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
        Subject: 'Saying Hello!'
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(bounceEvent);

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
          PropB: 'some value'
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
        Subject: 'Saying Hello!'
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(spamEvent);

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
          Family: 'Chrome'
        },
        OS: {
          Name: 'macOS 26 Tahoe',
          Company: 'Apple Computer, Inc.',
          Family: 'macOS'
        },
        Platform: 'WebMail',
        UserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36',
        ReadSeconds: 5,
        Geo: {
          CountryISOCode: 'US',
          Country: 'United States',
          City: 'Houston',
          IP: '203.0.113.42'
        },
        MessageID: '883953f4-6105-42a2-a16a-77a8eac79483',
        Metadata: {
          PropA: 'some value',
          PropB: 'some value'
        },
        ReceivedAt: '2026-11-05T16:33:54.9070259Z',
        Tag: 'welcome-email',
        Recipient: 'user@example.com'
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(openEvent);

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
          Family: 'Chrome'
        },
        OS: {
          Name: 'macOS 26 Tahoe',
          Company: 'Apple Computer, Inc.',
          Family: 'macOS'
        },
        Platform: 'Desktop',
        UserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36',
        OriginalLink: 'https://example.com/confirm-your-address',
        Geo: {
          CountryISOCode: 'US',
          Country: 'United States',
          City: 'Houston',
          IP: '203.0.113.42'
        },
        MessageID: '883953f4-6105-42a2-a16a-77a8eac79483',
        Metadata: {
          PropA: 'some value',
          PropB: 'some value'
        },
        ReceivedAt: '2026-11-05T16:33:54.9070259Z',
        Tag: 'welcome-email',
        Recipient: 'user@example.com'
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(clickEvent);

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
          PropB: 'some value'
        }
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(deliveryEvent);

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
          PropB: 'some value'
        }
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(subscriptionEvent);

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
          MailboxHash: ''
        },
        To: 'yourhash+SampleHash@inbound.postmarkapp.com',
        ToFull: [
          {
            Email: 'yourhash+SampleHash@inbound.postmarkapp.com',
            Name: '',
            MailboxHash: 'SampleHash'
          }
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
            Value: 'No'
          }
        ],
        Attachments: []
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(inboundEvent);

      expect(response.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Inbound email from: sender@example.com');
      expect(console.log).toHaveBeenCalledWith('  Subject: Saying Hello!');
    });

    it('should handle unknown event types gracefully', async () => {
      const unknownEvent = {
        RecordType: 'UnknownType',
        MessageID: 'test-message-id'
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(unknownEvent);

      expect(response.status).toBe(200);
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        service: 'postmark-webhook-handler'
      });
    });
  });
});