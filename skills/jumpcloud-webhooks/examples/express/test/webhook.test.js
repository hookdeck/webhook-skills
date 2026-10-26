const request = require('supertest');

// Set test environment variables before importing the app
process.env.JUMPCLOUD_WEBHOOK_USERNAME = 'jc_channel_user';
process.env.JUMPCLOUD_WEBHOOK_PASSWORD = 'p@ss:word:with:colons';

const app = require('../src/index');
const { verifyJumpCloudRequest, parseBasicAuth } = require('../src/index');

const USER = process.env.JUMPCLOUD_WEBHOOK_USERNAME;
const PASS = process.env.JUMPCLOUD_WEBHOOK_PASSWORD;

const basic = (u, p, scheme = 'Basic') =>
  `${scheme} ${Buffer.from(`${u}:${p}`).toString('base64')}`;

// Illustrative only: JumpCloud documents the field names, not an example body.
const samplePayload = () => ({
  alert_id: 'alert-0001',
  alert_title: 'Illustrative alert',
  category: 'illustrative',
  di_event: 'illustrative_event',
  event_description: 'Illustrative description',
  priority: 'High',
  rule_id: 'rule-0001',
  status: 'Open',
  occurred_at: '2026-01-01T00:00:00Z',
});

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app).post('/webhooks/jumpcloud').set('Content-Type', contentType).send(body);
}

describe('JumpCloud webhook endpoint', () => {
  describe('Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await post().set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('treats the scheme as case-insensitive', async () => {
      const res = await post().set('Authorization', basic(USER, PASS, 'basic'));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon only (password containing colons)', async () => {
      expect(parseBasicAuth(basic('a', 'b:c:d'))).toEqual({ username: 'a', password: 'b:c:d' });
    });

    it('rejects a wrong password', async () => {
      const res = await post().set('Authorization', basic(USER, 'wrong'));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await post().set('Authorization', basic('someone', PASS));
      expect(res.status).toBe(401);
    });

    it('rejects when both are wrong', async () => {
      const res = await post().set('Authorization', basic('x', 'y'));
      expect(res.status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      const res = await post().set('Authorization', `Bearer ${PASS}`);
      expect(res.status).toBe(401);
    });

    it('rejects malformed Basic values (no colon, bad base64)', async () => {
      const noColon = await post().set('Authorization', `Basic ${Buffer.from('nocolon').toString('base64')}`);
      expect(noColon.status).toBe(401);
      const junk = await post().set('Authorization', 'Basic !!!');
      expect(junk.status).toBe(401);
    });

    it('does not authenticate from a bare token header', async () => {
      const res = await post().set('Authorization', PASS);
      expect(res.status).toBe(401);
    });

    it('fails closed when credentials are not configured', () => {
      expect(verifyJumpCloudRequest({ authorization: basic('', '') }, '', '')).toBe(false);
      expect(verifyJumpCloudRequest({ authorization: basic(USER, PASS) }, USER, '')).toBe(false);
    });

    it('handles non-ASCII credentials', () => {
      const h = { authorization: basic('üser', 'pässwörd') };
      expect(verifyJumpCloudRequest(h, 'üser', 'pässwörd')).toBe(true);
      expect(verifyJumpCloudRequest(h, 'user', 'pässwörd')).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(
        'Authorization',
        basic(USER, PASS)
      );
      expect(res.status).toBe(200);
    });

    it('accepts application/vnd.api+json style types', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'application/alert+json').set(
        'Authorization',
        basic(USER, PASS)
      );
      expect(res.status).toBe(200);
    });

    it('returns 401 (not 400) for bad credentials with an invalid body', async () => {
      const res = await post('not json').set('Authorization', basic(USER, 'wrong'));
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid JSON with valid credentials', async () => {
      const res = await post('not json').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await post('[1,2]').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(400);
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
