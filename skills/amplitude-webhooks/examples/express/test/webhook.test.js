const request = require('supertest');

// Set test environment variables before importing the app
process.env.AMPLITUDE_WEBHOOK_HEADER = 'X-Amplitude-Secret';
process.env.AMPLITUDE_WEBHOOK_SECRET = 'Bearer test_amplitude_secret_0123456789';

const app = require('../src/index');
const { verifyAmplitudeRequest } = require('../src/index');

const HEADER = process.env.AMPLITUDE_WEBHOOK_HEADER;
const SECRET = process.env.AMPLITUDE_WEBHOOK_SECRET;

const eventPayload = {
  event_type: 'Button Clicked',
  user_id: 'user-123',
  event_time: '2026-10-22 20:07:01.795',
  event_properties: { button: 'signup' },
  user_properties: { plan: 'growth' },
};

const userPayload = {
  user_id: 'user-123',
  user_properties: { email: 'a@example.com' },
};

function post(body = JSON.stringify(eventPayload), contentType = 'application/json') {
  return request(app).post('/webhooks/amplitude').set('Content-Type', contentType).send(body);
}

describe('Amplitude webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the exact header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await post().set(HEADER, SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });
  });

  describe('verifyAmplitudeRequest', () => {
    it('defaults the header name to Authorization', () => {
      delete process.env.AMPLITUDE_WEBHOOK_HEADER;
      try {
        expect(verifyAmplitudeRequest({ authorization: 'Bearer abc' }, 'Bearer abc')).toBe(true);
      } finally {
        process.env.AMPLITUDE_WEBHOOK_HEADER = HEADER;
      }
    });

    it('returns false when no secret is configured', () => {
      expect(verifyAmplitudeRequest({ [HEADER.toLowerCase()]: SECRET }, '')).toBe(false);
    });

    it('handles non-ASCII values', () => {
      expect(verifyAmplitudeRequest({ authorization: 'sécret-✓' }, 'sécret-✓', 'Authorization')).toBe(true);
      expect(verifyAmplitudeRequest({ authorization: 'sécret-✗' }, 'sécret-✓', 'Authorization')).toBe(false);
    });
  });

  describe('payload handling', () => {
    it('handles a forwarded event', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('handles a user properties update', async () => {
      const res = await post(JSON.stringify(userPayload)).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts a custom template payload', async () => {
      const res = await post(JSON.stringify({ name: 'click event', external_id: 'u1' })).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(eventPayload), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('authenticates before parsing: bad JSON with a bad secret is 401', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid JSON with a valid secret', async () => {
      const res = await post('not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await post('[]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });
  });

  it('serves /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
