const request = require('supertest');

// Set test environment variables before importing the app
process.env.METABASE_WEBHOOK_USERNAME = 'metabase-hook';
process.env.METABASE_WEBHOOK_PASSWORD = 'p@ss:w0rd/with+chars';

const app = require('../src/index');
const { verifyMetabaseRequest } = require('../src/index');

const USER = process.env.METABASE_WEBHOOK_USERNAME;
const PASS = process.env.METABASE_WEBHOOK_PASSWORD;

function basic(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}
const GOOD = basic(USER, PASS);

function samplePayload(overrides = {}) {
  return {
    type: 'alert',
    alert_id: 12,
    alert_creator_id: 2666,
    alert_creator_name: 'Roberto Bolaño',
    data: {
      type: 'question',
      question_id: 108,
      question_name: 'Sales',
      question_url: 'https://example.com/question/108',
      visualization: 'data:image/png;base64,iVBORw0KGgo=',
      raw_data: { cols: ['CREATED_AT', 'count'], rows: [['2024-08-01T00:00:00Z', 501]] }
    },
    sent_at: '2024-09-30T20:16:15.76582Z',
    ...overrides
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/metabase')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Metabase webhook endpoint', () => {
  describe('Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await post().set('Authorization', GOOD);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts a case-insensitive scheme', async () => {
      const res = await post().set('Authorization', GOOD.replace('Basic', 'bAsIc'));
      expect(res.status).toBe(200);
    });

    it('accepts non-ASCII and colon-containing passwords (splits on first colon)', async () => {
      const header = basic('metabase-hook', 'p@ss:w0rd/with+chars');
      expect((await post().set('Authorization', header)).status).toBe(200);
      expect(verifyMetabaseRequest({ authorization: basic('üser', 'pä:ss') }, 'üser', 'pä:ss')).toBe(true);
    });

    it('rejects a wrong password', async () => {
      const res = await post().set('Authorization', basic(USER, 'wrong'));
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/^Basic/);
    });

    it('rejects a wrong username', async () => {
      expect((await post().set('Authorization', basic('someone', PASS))).status).toBe(401);
    });

    it('rejects when both are wrong', async () => {
      expect((await post().set('Authorization', basic('a', 'b'))).status).toBe(401);
    });

    it('rejects a password of the same length without throwing', async () => {
      expect((await post().set('Authorization', basic(USER, 'x'.repeat(PASS.length)))).status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      expect((await post()).status).toBe(401);
    });

    it('rejects other schemes (Bearer)', async () => {
      expect((await post().set('Authorization', `Bearer ${PASS}`)).status).toBe(401);
    });

    it('rejects non-base64 characters', async () => {
      expect((await post().set('Authorization', 'Basic !!!not-base64!!!')).status).toBe(401);
    });

    it('rejects valid credentials followed by junk', async () => {
      const b64 = GOOD.slice('Basic '.length);
      expect((await post().set('Authorization', `Basic ${b64}!!`)).status).toBe(401);
      expect((await post().set('Authorization', `Basic ${b64}=`)).status).toBe(401);
      expect((await post().set('Authorization', `${GOOD} extra`)).status).toBe(401);
    });

    it('rejects credentials without a colon', async () => {
      const header = `Basic ${Buffer.from('nocolon').toString('base64')}`;
      expect((await post().set('Authorization', header)).status).toBe(401);
    });

    it('rejects everything when credentials are not configured', () => {
      expect(verifyMetabaseRequest({ authorization: GOOD }, '', '')).toBe(false);
      expect(verifyMetabaseRequest({ authorization: basic('', '') }, '', '')).toBe(false);
      expect(verifyMetabaseRequest({ authorization: GOOD }, USER, PASS)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set('Authorization', GOOD);
      expect(res.status).toBe(200);
    });

    it('accepts a large body (base64 PNG)', async () => {
      const big = samplePayload();
      big.data.visualization = 'data:image/png;base64,' + 'A'.repeat(500 * 1024);
      const res = await post(JSON.stringify(big)).set('Authorization', GOOD);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      expect((await post('{not json').set('Authorization', GOOD)).status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      expect((await post('[1,2]').set('Authorization', GOOD)).status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without credentials', async () => {
      expect((await post('{not json')).status).toBe(401);
    });
  });

  describe('Event handling', () => {
    let spy;
    beforeEach(() => { spy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => spy.mockRestore());

    it('handles alert', async () => {
      const res = await post().set('Authorization', GOOD);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Alert'))).toBe(true);
    });

    it('handles a test alert (alert_id null)', async () => {
      const res = await post(JSON.stringify(samplePayload({ alert_id: null }))).set('Authorization', GOOD);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).includes('test alert'))).toBe(true);
    });

    it('acknowledges unknown types', async () => {
      const res = await post(JSON.stringify(samplePayload({ type: 'something_new' }))).set('Authorization', GOOD);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
