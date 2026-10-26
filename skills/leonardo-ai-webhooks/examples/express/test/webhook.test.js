const request = require('supertest');

// Set test environment variables before importing the app
process.env.LEONARDO_AI_WEBHOOK_SECRET = 'test_leonardo_callback_key_0123456789';

const app = require('../src/index');
const { verifyLeonardoRequest } = require('../src/index');

const SECRET = process.env.LEONARDO_AI_WEBHOOK_SECRET;
const BEARER = `Bearer ${SECRET}`;

// Based on the payload shown in Leonardo.Ai's webhook callback guide (trimmed).
function samplePayload(type = 'image_generation.complete') {
  return {
    type,
    object: 'generation',
    timestamp: 1699490546932,
    api_version: 'v1',
    data: {
      object: {
        id: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
        status: 'COMPLETE',
        prompt: 'An oil painting of a cat',
        images: [
          {
            id: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
            url: 'https://cdn.leonardo.ai/users/x/generations/y/Leonardo_Creative_An_oil_painting_of_a_cat_0.jpg',
            generationId: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX'
          }
        ]
      }
    }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/leonardo-ai')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Leonardo.Ai webhook endpoint', () => {
  describe('Authorization Bearer verification', () => {
    it('accepts the correct key', async () => {
      const res = await post().set('Authorization', BEARER);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the scheme case-insensitively', async () => {
      for (const scheme of ['bearer', 'BEARER', 'BeArEr']) {
        const res = await post().set('Authorization', `${scheme} ${SECRET}`);
        expect(res.status).toBe(200);
      }
    });

    it('rejects a wrong key of the same length', async () => {
      const res = await post().set('Authorization', `Bearer ${'x'.repeat(SECRET.length)}`);
      expect(res.status).toBe(401);
    });

    it('rejects a key of a different length without throwing', async () => {
      const res = await post().set('Authorization', 'Bearer short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects the bare key without the Bearer scheme', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects a different scheme', async () => {
      const res = await post().set('Authorization', `Basic ${SECRET}`);
      expect(res.status).toBe(401);
    });

    it('does not trim the key', () => {
      // HTTP clients normalise outer header whitespace, so check the helper directly.
      expect(verifyLeonardoRequest({ authorization: BEARER }, `${SECRET} `)).toBe(false);
      expect(verifyLeonardoRequest({ authorization: BEARER }, SECRET)).toBe(true);
    });

    it('rejects everything when LEONARDO_AI_WEBHOOK_SECRET is unset', () => {
      const headers = { authorization: BEARER };
      expect(verifyLeonardoRequest(headers, '')).toBe(false);
      delete process.env.LEONARDO_AI_WEBHOOK_SECRET;
      expect(verifyLeonardoRequest(headers)).toBe(false);
      process.env.LEONARDO_AI_WEBHOOK_SECRET = SECRET;
    });

    it('strips a "Bearer " prefix from the configured secret', () => {
      expect(verifyLeonardoRequest({ authorization: BEARER }, `bearer ${SECRET}`)).toBe(true);
      expect(verifyLeonardoRequest({ authorization: BEARER }, 'Bearer ')).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('Authorization', BEARER);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', BEARER);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('Authorization', BEARER);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a key', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it('handles image_generation.complete', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post().set('Authorization', BEARER);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).includes('COMPLETE: 1 image(s)'))).toBe(true);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('something.new'))).set('Authorization', BEARER);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
