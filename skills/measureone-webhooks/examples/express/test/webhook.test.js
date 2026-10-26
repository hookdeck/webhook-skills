const request = require('supertest');

// Set test environment variables before importing the app
process.env.MEASUREONE_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.MEASUREONE_WEBHOOK_SECRET = 'Bearer test_measureone_secret_0123456789';

const app = require('../src/index');
const { verifyMeasureOneRequest } = require('../src/index');

const HEADER = process.env.MEASUREONE_WEBHOOK_HEADER;
const SECRET = process.env.MEASUREONE_WEBHOOK_SECRET;

const EVENTS = [
  'datarequest.report_available', 'datarequest.report_complete', 'datarequest.report_update_available',
  'datarequest.report_error', 'datarequest.items_available', 'datarequest.items_processed',
  'datarequest.no_items', 'datarequest.updates_available', 'datarequest.acquisition_completed',
  'datarequest.refresh_failed', 'datasource.connected', 'transaction.processed',
  'unprocessable.entity', 'session.completed', 'session.rejected', 'session.terminated',
  'session.no_login', 'item.created', 'item.processed', 'item.unavailable', 'individual.purged'
];

function samplePayload(event = 'datarequest.items_available') {
  return {
    event,
    datarequest_id: 'dr_01',
    individual_id: 'ind_01',
    external_id: 'ext_01',
    metadata: {},
    is_refresh: false
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/measureone')
    .set('Content-Type', contentType)
    .send(body);
}

describe('MeasureOne webhook endpoint', () => {
  describe('static header verification', () => {
    it('accepts the correct whole header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the Bearer prefix is not stripped', async () => {
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

    it('does not look at other headers', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('uses the Authorization header when no header name is configured', () => {
      expect(verifyMeasureOneRequest({ authorization: 'abc' }, 'abc', 'Authorization')).toBe(true);
      expect(verifyMeasureOneRequest({ authorization: 'abc' }, 'abd', 'Authorization')).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      expect(verifyMeasureOneRequest({ [HEADER.toLowerCase()]: 'x' }, '', HEADER)).toBe(false);
      expect(verifyMeasureOneRequest({}, undefined, HEADER)).toBe(false);
    });

    it('authenticates before parsing the body', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const res = await post(JSON.stringify(samplePayload(event))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts an unknown event', async () => {
      const res = await post(JSON.stringify(samplePayload('something.new'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await post('not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await post('[1,2]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });
  });
});
