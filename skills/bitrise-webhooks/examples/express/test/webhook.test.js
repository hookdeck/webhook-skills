const request = require('supertest');

// Set test environment variables before importing the app
process.env.BITRISE_WEBHOOK_SECRET = 'Bearer test_bitrise_secret_0123456789';
delete process.env.BITRISE_WEBHOOK_HEADER; // default: Authorization

const app = require('../src/index');
const { verifyBitriseRequest } = require('../src/index');

const SECRET = process.env.BITRISE_WEBHOOK_SECRET;

const EVENTS = [
  'app_version_added', 'testflight_upload_started', 'testflight_upload_completed',
  'testflight_upload_failed', 'testflight_processing_completed', 'testflight_processing_failed',
  'testflight_app_review_approved', 'testflight_app_review_rejected',
  'google_play_upload_completed', 'google_play_upload_failed', 'app_store_review_approved',
  'app_store_review_rejected', 'app_store_release_completed', 'google_play_release_completed'
];

function releasePayload(event = 'testflight_upload_completed') {
  return {
    trigger_event: event,
    release_id: 'rel-123',
    app_id: 'app-123',
    triggered_by: 'Automation',
    webhook_event_unique_id: 'wh-1@1730000000000000000',
    file_name: 'MyApp.ipa',
    version: '1.4.0',
    version_code: '42'
  };
}

function post(body = JSON.stringify(releasePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/bitrise')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Bitrise webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct whole header value, Bearer prefix included', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix', async () => {
      const res = await post().set('Authorization', SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set('Authorization', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set('Authorization', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('reads the header name from BITRISE_WEBHOOK_HEADER', async () => {
      process.env.BITRISE_WEBHOOK_HEADER = 'X-Webhook-Secret';
      try {
        expect((await post().set('X-Webhook-Secret', SECRET)).status).toBe(200);
        expect((await post().set('Authorization', SECRET)).status).toBe(401);
      } finally {
        delete process.env.BITRISE_WEBHOOK_HEADER;
      }
    });

    it('handles non-ASCII header values without throwing', () => {
      expect(verifyBitriseRequest({ authorization: 'sécret-✓' }, SECRET)).toBe(false);
      expect(verifyBitriseRequest({ authorization: 'sécret-✓' }, 'sécret-✓')).toBe(true);
    });

    it('rejects everything when BITRISE_WEBHOOK_SECRET is unset', () => {
      expect(verifyBitriseRequest({ authorization: SECRET }, '')).toBe(false);
      delete process.env.BITRISE_WEBHOOK_SECRET;
      expect(verifyBitriseRequest({ authorization: SECRET })).toBe(false);
      process.env.BITRISE_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(releasePayload()), 'text/plain')
        .set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(releasePayload(event))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown Release Management events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(releasePayload('something_new'))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    it('acknowledges and logs payloads without trigger_event (undocumented CI build shape)', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify({ hello: 'world' })).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Payload without trigger_event'))).toBe(true);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
