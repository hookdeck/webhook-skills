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
  });

  describe('Event Processing', () => {
    it('should handle Bounce events', async () => {
      const bounceEvent = {
        RecordType: 'Bounce',
        MessageID: '883953f4-6105-42a2-a16a-77a8eac79483',
        Type: 'HardBounce',
        Email: 'bounced@example.com',
        Description: 'The email address does not exist',
        BouncedAt: '2024-01-15T10:30:00Z',
        ServerID: 23,
        MessageStream: 'outbound',
        Tag: 'welcome-email',
        Metadata: {
          user_id: '12345'
        }
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(bounceEvent);

      expect(response.status).toBe(200);
    });

    it('should handle SpamComplaint events', async () => {
      const spamEvent = {
        RecordType: 'SpamComplaint',
        MessageID: 'test-message-id',
        Email: 'user@example.com',
        BouncedAt: '2024-01-15T10:30:00Z',
        ServerID: 23,
        MessageStream: 'outbound'
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(spamEvent);

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
        ServerID: 23
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(openEvent);

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
        UserAgent: 'Mozilla/5.0'
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(clickEvent);

      expect(response.status).toBe(200);
    });

    it('should handle Delivery events', async () => {
      const deliveryEvent = {
        RecordType: 'Delivery',
        MessageID: 'test-message-id',
        Email: 'user@example.com',
        DeliveredAt: '2024-01-15T10:30:00Z',
        ServerID: 23,
        Details: 'Test details'
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(deliveryEvent);

      expect(response.status).toBe(200);
    });

    it('should handle SubscriptionChange events', async () => {
      const subscriptionEvent = {
        RecordType: 'SubscriptionChange',
        MessageID: 'test-message-id',
        Email: 'user@example.com',
        ChangedAt: '2024-01-15T10:30:00Z',
        SuppressionReason: 'ManualSuppression'
      };

      const response = await request(app)
        .post(webhookUrl)
        .send(subscriptionEvent);

      expect(response.status).toBe(200);
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