const request = require('supertest');

// Set test environment variables before importing the app
process.env.SOCURE_WEBHOOK_USERNAME = 'riskos-hook';
process.env.SOCURE_WEBHOOK_PASSWORD = 'p@ss:word-with-colon_0123456789';

const app = require('../src/index');
const { verifySocureRequest, parseBasicAuth } = require('../src/index');

const USER = process.env.SOCURE_WEBHOOK_USERNAME;
const PASS = process.env.SOCURE_WEBHOOK_PASSWORD;

const EVENTS = [
  'evaluation_completed', 'evaluation_paused', 'reevaluation', 'workflow_execution_failed',
  'decision_update', 'fraud_confirming', 'review_case_assigned', 'review_case_unassigned',
  'case_status_updated', 'case_notes_added', 'case_attachment_added',
  'watchlist_notification_monitored_search_updated', 'case_management_notification_case_closure'
];

function basic(user, pass, scheme = 'Basic') {
  return `${scheme} ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

function samplePayload(eventType = 'evaluation_completed') {
  return {
    event_id: '336ccd2a-b3a8-49a8-b2cc-89a4ae90feeb',
    event_at: '2025-01-15T13:04:11.468Z',
    event_type: eventType,
    data: { id: 'onb-12345', eval_id: '6dc8f39c-ecc3-4fe0-9283-fc8e5f99e816', decision: 'ACCEPT' }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/socure')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Socure webhook endpoint', () => {
  describe('Basic auth verification', () => {
    it('accepts the correct credentials', async () => {
      const res = await post().set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts a lowercase scheme', async () => {
      const res = await post().set('Authorization', basic(USER, PASS, 'basic'));
      expect(res.status).toBe(200);
    });

    it('accepts a password containing a colon (split on the first colon)', async () => {
      expect(PASS).toContain(':');
      const res = await post().set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects a wrong password', async () => {
      const res = await post().set('Authorization', basic(USER, 'wrong'));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await post().set('Authorization', basic('someone-else', PASS));
      expect(res.status).toBe(401);
    });

    it('rejects a Bearer token', async () => {
      const res = await post().set('Authorization', 'Bearer 6dc8f39c-ecc3-4fe0-9283-fc8e5f99e816');
      expect(res.status).toBe(401);
    });

    it('rejects malformed Basic values', async () => {
      for (const value of ['Basic', 'Basic !!!notbase64', `Basic ${Buffer.from('nocolon').toString('base64')}`]) {
        const res = await post().set('Authorization', value);
        expect(res.status).toBe(401);
      }
    });

    it('rejects credentials of a different length without throwing', async () => {
      const res = await post().set('Authorization', basic('x', 'y'));
      expect(res.status).toBe(401);
    });

    it('rejects non-ASCII credentials without throwing', async () => {
      const res = await post().set('Authorization', basic('üser', 'pässwörd'));
      expect(res.status).toBe(401);
    });

    it('rejects every request when credentials are not configured', () => {
      expect(verifySocureRequest({ authorization: basic(USER, PASS) }, '', '')).toBe(false);
      expect(verifySocureRequest({ authorization: basic(USER, '') }, USER, '')).toBe(false);
    });

    it('authenticates before parsing the body', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });
  });

  describe('parseBasicAuth', () => {
    it('splits on the first colon', () => {
      expect(parseBasicAuth(basic('a', 'b:c'))).toEqual({ username: 'a', password: 'b:c' });
    });

    it('returns null for non-strings and other schemes', () => {
      expect(parseBasicAuth(undefined)).toBeNull();
      expect(parseBasicAuth('Bearer abc')).toBeNull();
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const res = await post(JSON.stringify(samplePayload(eventType))).set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('acknowledges unknown event types', async () => {
      const res = await post(JSON.stringify(samplePayload('something_new'))).set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON with 400', async () => {
      const res = await post('not json').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(400);
    });

    it('rejects a non-object body with 400', async () => {
      const res = await post('[1,2]').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(400);
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
