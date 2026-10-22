const request = require('supertest');

// Set test environment variables before importing the app
process.env.NORTHFLANK_WEBHOOK_SECRET = 'test_northflank_secret_0123456789';

const app = require('../src/index');
const { verifyNorthflankRequest } = require('../src/index');

const SECRET = process.env.NORTHFLANK_WEBHOOK_SECRET;
const HEADER = 'X-Northflank-Notification-Integration-Token';

// Shape from Northflank's docs for a build:start notification
function samplePayload(event = 'build:start') {
  return {
    event,
    data: {
      build: {
        id: 'social-hour-1312',
        branch: 'master',
        pullRequestId: null,
        status: 'STARTING',
        sha: 'ca624abed0d5ba0ad6e6fe28c396196b81f0200d',
        concluded: false,
        createdAt: '2022-01-19T09:04:40.916Z'
      },
      service: { id: 'website', name: 'Website' },
      project: { id: 'personal-blog', name: 'Personal Blog' },
      user: { id: 'thomas' }
    }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/northflank')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Northflank webhook endpoint', () => {
  describe('Token verification', () => {
    it('accepts the correct token', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('x-northflank-notification-integration-token', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('returns 401 when the token header is missing', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });
  });

  describe('Request handling', () => {
    it('verifies any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for an invalid JSON body', async () => {
      const res = await post('{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2,3]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('handles every example event and unknown events', async () => {
      const events = [
        'build:start',
        'build:success',
        'build:failure',
        'service:deployment:status-update',
        'job-run:failure',
        'addon-backup:success',
        'addon-backup:failure',
        'billing:invoice-payment-failed',
        'something:else'
      ];
      for (const event of events) {
        const res = await post(JSON.stringify({ event, data: {} })).set(HEADER, SECRET);
        expect(res.status).toBe(200);
      }
    });
  });

  describe('verifyNorthflankRequest', () => {
    it('rejects everything when no secret is configured', () => {
      const headers = { 'x-northflank-notification-integration-token': '' };
      expect(verifyNorthflankRequest(headers, {})).toBe(false);
      expect(verifyNorthflankRequest({}, {})).toBe(false);
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
