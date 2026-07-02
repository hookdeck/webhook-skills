const request = require('supertest');

// Set test environment variables before importing app
process.env.AUTH0_LOG_STREAM_TOKEN = 'test_log_stream_token';

const app = require('../src/index');

const TOKEN = process.env.AUTH0_LOG_STREAM_TOKEN;

// A realistic batched Auth0 log stream payload (array of records).
function sampleBatch() {
  return [
    {
      log_id: '90020210714154213417000000000000000000000000000000',
      data: {
        date: '2021-07-14T15:42:13.410Z',
        type: 's',
        description: 'Successful login',
        connection: 'Username-Password-Authentication',
        client_id: 'AbC123ClientId',
        client_name: 'My App',
        ip: '203.0.113.10',
        user_id: 'auth0|64f0000000000000000000001',
        user_name: 'user@example.com'
      }
    }
  ];
}

describe('Auth0 Webhook Endpoint', () => {
  describe('POST /webhooks/auth0', () => {
    it('should return 401 for missing Authorization header', async () => {
      const response = await request(app)
        .post('/webhooks/auth0')
        .set('Content-Type', 'application/json')
        .send(sampleBatch());

      expect(response.status).toBe(401);
    });

    it('should return 401 for invalid Authorization token', async () => {
      const response = await request(app)
        .post('/webhooks/auth0')
        .set('Content-Type', 'application/json')
        .set('Authorization', 'wrong_token')
        .send(sampleBatch());

      expect(response.status).toBe(401);
    });

    it('should return 200 for a valid token', async () => {
      const response = await request(app)
        .post('/webhooks/auth0')
        .set('Content-Type', 'application/json')
        .set('Authorization', TOKEN)
        .send(sampleBatch());

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: 1 });
    });

    it('should process a batch of multiple events', async () => {
      const batch = [
        { data: { type: 's', user_name: 'a@example.com' } },
        { data: { type: 'f', ip: '203.0.113.10', description: 'wrong password' } },
        { data: { type: 'ss', user_name: 'b@example.com' } },
        { data: { type: 'fs', description: 'invalid email' } },
        { data: { type: 'sepft', user_name: 'a@example.com' } },
        { data: { type: 'unknown_code' } }
      ];

      const response = await request(app)
        .post('/webhooks/auth0')
        .set('Content-Type', 'application/json')
        .set('Authorization', TOKEN)
        .send(batch);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: 6 });
    });

    it('should reject a token of a different length (no timing-safe throw)', async () => {
      const response = await request(app)
        .post('/webhooks/auth0')
        .set('Content-Type', 'application/json')
        .set('Authorization', 'short')
        .send(sampleBatch());

      expect(response.status).toBe(401);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
