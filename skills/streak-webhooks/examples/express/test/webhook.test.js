const request = require('supertest');

// Set test environment variables before importing the app
process.env.STREAK_WEBHOOK_TOKEN = 'test_streak_token_0123456789';

const app = require('../src/index');
const { verifyStreakRequest } = require('../src/index');

const TOKEN = process.env.STREAK_WEBHOOK_TOKEN;

const EVENTS = [
  'BOX_CREATE', 'BOX_DELETE', 'STAGE_CREATE', 'BOX_NEW_EMAIL_ADDRESS', 'BOX_EDIT',
  'BOX_CHANGE_STAGE', 'BOX_CHANGE_PIPELINE', 'COMMENT_CREATE', 'MEETING_CREATE',
  'MEETING_UPDATE', 'TASK_CREATE', 'TASK_COMPLETE', 'TASK_DUE', 'TASK_UPDATED',
  'CONTACT_CREATE', 'ORG_CREATE', 'CONTACT_UPDATE', 'ORG_UPDATE', 'CONTACT_DELETE',
  'ORG_DELETE',
];

const samplePayload = () => [
  { key: 'gICIxYzv9QoM', pipelineKey: 'agxzfm1hZaXCgw', name: 'Acme deal', creationDate: 1507226274178 },
];

function post(event = 'BOX_CREATE', body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post(`/webhooks/streak${event ? `?event=${event}` : ''}`)
    .set('Content-Type', contentType)
    .send(body);
}

describe('Streak webhook endpoint', () => {
  describe('X-Streak-Webhook-Token verification', () => {
    it('accepts the correct token', async () => {
      const res = await post().set('X-Streak-Webhook-Token', TOKEN);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('x-streak-webhook-token', TOKEN);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await post().set('X-Streak-Webhook-Token', 'x'.repeat(TOKEN.length));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await post().set('X-Streak-Webhook-Token', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a token that only has the right prefix (whole value must match)', async () => {
      const res = await post().set('X-Streak-Webhook-Token', `${TOKEN}-extra`);
      expect(res.status).toBe(401);
    });

    it('rejects a missing token', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('does not accept the token as an Authorization bearer', async () => {
      const res = await post().set('Authorization', `Bearer ${TOKEN}`);
      expect(res.status).toBe(401);
    });

    it('rejects every request when no token is configured', () => {
      expect(verifyStreakRequest({ 'x-streak-webhook-token': TOKEN }, '')).toBe(false);
    });

    it('authenticates before parsing the body', async () => {
      const res = await post('BOX_CREATE', 'not json');
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const res = await post(event).set('X-Streak-Webhook-Token', TOKEN);
      expect(res.status).toBe(200);
    });

    it('accepts a request with no event query parameter', async () => {
      const res = await post(null).set('X-Streak-Webhook-Token', TOKEN);
      expect(res.status).toBe(200);
    });

    it('accepts a single object as well as an array', async () => {
      const res = await post('BOX_EDIT', JSON.stringify(samplePayload()[0])).set('X-Streak-Webhook-Token', TOKEN);
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await post('BOX_CREATE', JSON.stringify(samplePayload()), 'text/plain').set('X-Streak-Webhook-Token', TOKEN);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await post('BOX_CREATE', 'not json').set('X-Streak-Webhook-Token', TOKEN);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await post('BOX_CREATE', '"hello"').set('X-Streak-Webhook-Token', TOKEN);
      expect(res.status).toBe(400);
    });
  });

  it('serves /health', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
