const request = require('supertest');

// Set test environment variables before importing app
process.env.AUTH0_EVENT_STREAM_TOKEN = 'test_event_stream_token';

const app = require('../src/index');

const AUTH = `Bearer ${process.env.AUTH0_EVENT_STREAM_TOKEN}`;

// Shape of the user.created example in Auth0's Event Catalog.
function sampleEvent(type = 'user.created') {
  return {
    specversion: '1.0',
    type,
    source: 'urn:auth0:example.auth0app.com',
    id: 'evt_vjFVP5pVdfvsfRKatshkVV',
    time: '2025-02-01T12:34:56Z',
    data: {
      object: {
        user_id: 'auth0|507f1f77bcf86cd799439020',
        email: 'user1@example.com',
        created_at: '2025-02-01T12:34:56Z',
        updated_at: '2025-02-01T12:34:56Z'
      }
    },
    a0tenant: 'my-tenant',
    a0stream: 'est_vjFVP5pVdfvsfRKatshkVV'
  };
}

describe('Auth0 Webhook Endpoint', () => {
  describe('POST /webhooks/auth0', () => {
    it('should return 401 for a missing Authorization header', async () => {
      const response = await request(app)
        .post('/webhooks/auth0')
        .set('Content-Type', 'application/json')
        .send(sampleEvent());

      expect(response.status).toBe(401);
    });

    it('should return 401 for a wrong token', async () => {
      const response = await request(app)
        .post('/webhooks/auth0')
        .set('Content-Type', 'application/json')
        .set('Authorization', 'Bearer wrong_token_value_here')
        .send(sampleEvent());

      expect(response.status).toBe(401);
    });

    it('should return 401 for the token without the Bearer prefix', async () => {
      const response = await request(app)
        .post('/webhooks/auth0')
        .set('Content-Type', 'application/json')
        .set('Authorization', process.env.AUTH0_EVENT_STREAM_TOKEN)
        .send(sampleEvent());

      expect(response.status).toBe(401);
    });

    it('should return 204 for a valid Authorization header', async () => {
      const response = await request(app)
        .post('/webhooks/auth0')
        .set('Content-Type', 'application/json')
        .set('Authorization', AUTH)
        .send(sampleEvent());

      expect(response.status).toBe(204);
    });

    it('should accept other event types', async () => {
      for (const type of ['user.updated', 'user.deleted', 'organization.member.added', 'group.created']) {
        const response = await request(app)
          .post('/webhooks/auth0')
          .set('Content-Type', 'application/json')
          .set('Authorization', AUTH)
          .send(sampleEvent(type));

        expect(response.status).toBe(204);
      }
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
