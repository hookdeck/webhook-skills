const request = require('supertest');
const app = require('../src/index');

describe('Deepgram Webhook Handler', () => {
  const callbackUsername = 'dg_user';
  const callbackPassword = 'dg:pass-123'; // contains ':' on purpose
  const validApiKeyId = 'test_api_key_id_12345';
  const basicAuth = (user, pass) =>
    'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  const validAuth = basicAuth(callbackUsername, callbackPassword);

  // Shape from Deepgram's pre-recorded /v1/listen response example:
  // https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded
  const validPayload = {
    metadata: {
      request_id: 'a847f427-4ad5-4d67-9b95-db801e58251c',
      sha256: '154e291ecfa8be6ab8343560bcc109008fa7853eb5372533e8efdefc9b504c33',
      created: '2024-05-12T18:57:13.426Z',
      duration: 25.933313,
      channels: 1,
      models: ['30089e05-99d1-4376-b32e-c263170674af'],
      model_info: {
        '30089e05-99d1-4376-b32e-c263170674af': {
          name: '2-general-nova',
          version: '2024-01-09.29447',
          arch: 'nova-2'
        }
      }
    },
    results: {
      channels: [
        {
          alternatives: [
            {
              transcript: "Yeah, as as much as, it's worth having a talk to the neighbors.",
              confidence: 0.9840088,
              words: [
                {
                  word: 'yeah',
                  start: 0.08,
                  end: 0.32,
                  confidence: 0.9975586
                }
              ]
            }
          ]
        }
      ]
    }
  };

  // Set test environment variables
  beforeAll(() => {
    process.env.DEEPGRAM_CALLBACK_USERNAME = callbackUsername;
    process.env.DEEPGRAM_CALLBACK_PASSWORD = callbackPassword;
    process.env.DEEPGRAM_API_KEY_ID = validApiKeyId;
  });

  describe('POST /webhooks/deepgram', () => {
    it('should accept valid Basic Auth without a dg-token header', async () => {
      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('Authorization', validAuth)
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('requestId', 'a847f427-4ad5-4d67-9b95-db801e58251c');
    });

    it('should accept valid Basic Auth with a matching dg-token', async () => {
      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('Authorization', validAuth)
        .set('dg-token', validApiKeyId)
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(response.status).toBe(200);
    });

    it('should reject webhook with missing Authorization header', async () => {
      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('dg-token', validApiKeyId)
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid Basic Auth credentials');
    });

    it('should reject webhook with wrong Basic Auth password', async () => {
      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('Authorization', basicAuth(callbackUsername, 'wrong'))
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(response.status).toBe(401);
    });

    it('should reject webhook with a mismatched dg-token', async () => {
      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('Authorization', validAuth)
        .set('dg-token', 'invalid_token')
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Invalid dg-token');
    });

    it('should handle webhook with minimal payload', async () => {
      const minimalPayload = {
        metadata: {
          request_id: 'req_minimal',
          created: '2024-01-20T10:30:00.000Z',
          duration: 10.0,
          channels: 1
        },
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
        .set('Authorization', validAuth)
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
        .set('Authorization', validAuth)
        .set('Content-Type', 'application/json')
        .send(emptyTranscriptPayload);

      expect(response.status).toBe(200);
    });

    it('should reject invalid JSON payload', async () => {
      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('Authorization', validAuth)
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid webhook payload');
    });

    it('should handle multi-channel transcription', async () => {
      const multiChannelPayload = {
        ...validPayload,
        metadata: { ...validPayload.metadata, channels: 2 },
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
        .set('Authorization', validAuth)
        .set('Content-Type', 'application/json')
        .send(multiChannelPayload);

      expect(response.status).toBe(200);
    });

    it('should handle webhook with extra metadata', async () => {
      const extraPayload = {
        ...validPayload,
        metadata: {
          ...validPayload.metadata,
          extra: {
            user_id: '12345',
            session_id: 'session-abc'
          }
        }
      };

      const response = await request(app)
        .post('/webhooks/deepgram')
        .set('Authorization', validAuth)
        .set('Content-Type', 'application/json')
        .send(extraPayload);

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
