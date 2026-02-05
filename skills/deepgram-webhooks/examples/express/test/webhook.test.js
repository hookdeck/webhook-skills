const request = require('supertest');
const app = require('../src/index');

describe('Deepgram Webhook Handler', () => {
  const validApiKeyId = 'test_api_key_id_12345';
  const validPayload = {
    request_id: 'req_123456789',
    created: '2024-01-20T10:30:00.000Z',
    duration: 30.5,
    channels: 1,
    model_info: {
      name: 'general',
      version: '2024-01-09.29447',
      arch: 'nova-2'
    },
    results: {
      channels: [
        {
          alternatives: [
            {
              transcript: 'This is a test transcription from Deepgram.',
              confidence: 0.98765,
              words: [
                {
                  word: 'This',
                  start: 0.0,
                  end: 0.24,
                  confidence: 0.99
                }
              ]
            }
          ]
        }
      ]
    },
    metadata: {
      transaction_key: 'test_transaction',
      request_time: 1.234,
      created_time: '2024-01-20T10:30:00.000Z'
    }
  };

  // Set test environment variable
  beforeAll(() => {
    process.env.DEEPGRAM_API_KEY_ID = validApiKeyId;
  });

  describe('POST /webhooks/deepgram', () => {
    it('should accept valid webhook with correct dg-token', async () => {
      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('dg-token', validApiKeyId)
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('requestId', 'req_123456789');
    });

    it('should reject webhook with missing dg-token', async () => {
      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Missing dg-token header');
    });

    it('should reject webhook with invalid dg-token', async () => {
      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('dg-token', 'invalid_token')
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Invalid dg-token');
    });

    it('should handle webhook with minimal payload', async () => {
      const minimalPayload = {
        request_id: 'req_minimal',
        created: '2024-01-20T10:30:00.000Z',
        duration: 10.0,
        channels: 1,
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: 'Short test.',
                  confidence: 0.95
                }
              ]
            }
          ]
        }
      };

      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('dg-token', validApiKeyId)
        .set('Content-Type', 'application/json')
        .send(minimalPayload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('requestId', 'req_minimal');
    });

    it('should handle webhook with empty transcript', async () => {
      const emptyTranscriptPayload = {
        ...validPayload,
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: '',
                  confidence: 0.0
                }
              ]
            }
          ]
        }
      };

      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('dg-token', validApiKeyId)
        .set('Content-Type', 'application/json')
        .send(emptyTranscriptPayload);

      expect(response.status).toBe(200);
    });

    it('should reject invalid JSON payload', async () => {
      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('dg-token', validApiKeyId)
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid webhook payload');
    });

    it('should handle multi-channel transcription', async () => {
      const multiChannelPayload = {
        ...validPayload,
        channels: 2,
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: 'Channel 1 transcription.',
                  confidence: 0.98
                }
              ]
            },
            {
              alternatives: [
                {
                  transcript: 'Channel 2 transcription.',
                  confidence: 0.97
                }
              ]
            }
          ]
        }
      };

      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('dg-token', validApiKeyId)
        .set('Content-Type', 'application/json')
        .send(multiChannelPayload);

      expect(response.status).toBe(200);
    });

    it('should handle webhook with custom metadata', async () => {
      const metadataPayload = {
        ...validPayload,
        metadata: {
          user_id: '12345',
          session_id: 'session-abc',
          custom_field: 'custom_value'
        }
      };

      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('dg-token', validApiKeyId)
        .set('Content-Type', 'application/json')
        .send(metadataPayload);

      expect(response.status).toBe(200);
    });
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
    });
  });
});