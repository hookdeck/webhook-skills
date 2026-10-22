const request = require('supertest');

// Set test environment variables before importing the app
process.env.FOURKITES_WEBHOOK_USERNAME = 'fk_user';
process.env.FOURKITES_WEBHOOK_PASSWORD = 'p@ss:word/with:colons';

const app = require('../src/index');
const { verifyFourKitesRequest } = require('../src/index');

const USER = process.env.FOURKITES_WEBHOOK_USERNAME;
const PASS = process.env.FOURKITES_WEBHOOK_PASSWORD;

const EVENTS = [
  'LOAD_CREATION', 'LOCATION_UPDATE', 'TRACKING_UPDATE', 'STOP_ETA_UPDATED', 'STOP_ARRIVAL',
  'STOP_DEPARTURE', 'STOP_AUTO_COMPLETED', 'MANUALLY_DELIVERED', 'MANUALLY_PICKED_UP',
  'STOP_APPOINTMENT_RESCHEDULED', 'STOP_AMEND', 'LOAD_DELETED'
];

const basic = (u, p, scheme = 'Basic') =>
  `${scheme} ${Buffer.from(`${u}:${p}`).toString('base64')}`;

function samplePayload(type = 'STOP_ARRIVAL') {
  return {
    MessageType: type,
    FourKitesLoadId: 1234,
    LoadNumber: 'BOL12345',
    StopName: 'ABC Stop',
    Timestamp: '2015-10-01T16:00:00-05:00'
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/fourkites')
    .set('Content-Type', contentType)
    .send(body);
}

describe('FourKites webhook endpoint', () => {
  describe('Basic auth verification', () => {
    it('accepts the correct credentials', async () => {
      const res = await post().set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts the scheme case-insensitively', async () => {
      const res = await post().set('Authorization', basic(USER, PASS, 'basic'));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon only (password may contain colons)', async () => {
      expect(PASS).toContain(':');
      const res = await post().set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong password of the same length', async () => {
      const res = await post().set('Authorization', basic(USER, 'x'.repeat(PASS.length)));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await post().set('Authorization', basic('other', PASS));
      expect(res.status).toBe(401);
    });

    it('rejects credentials of a different length without throwing', async () => {
      const res = await post().set('Authorization', basic('u', 'p'));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      const res = await post().set('Authorization', `Bearer ${PASS}`);
      expect(res.status).toBe(401);
    });

    it('rejects a Basic value with no colon', async () => {
      const res = await post().set('Authorization', `Basic ${Buffer.from('nocolon').toString('base64')}`);
      expect(res.status).toBe(401);
    });

    it('rejects an empty Basic value', async () => {
      const res = await post().set('Authorization', 'Basic ');
      expect(res.status).toBe(401);
    });

    it('fails closed when credentials are not configured', () => {
      expect(verifyFourKitesRequest({ authorization: basic(USER, PASS) }, '', '')).toBe(false);
      expect(verifyFourKitesRequest({ authorization: basic('', '') }, undefined, undefined)).toBe(false);
    });
  });

  describe('events', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const res = await post(JSON.stringify(samplePayload(type))).set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('accepts an unknown MessageType', async () => {
      const res = await post(JSON.stringify(samplePayload('SOMETHING_NEW'))).set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('does not parse the body before authenticating', async () => {
      const res = await post('{not json').set('Authorization', basic(USER, 'wrong'));
      expect(res.status).toBe(401);
    });

    it('rejects invalid JSON with 400', async () => {
      const res = await post('{not json').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(400);
    });

    it('rejects a non-object body with 400', async () => {
      const res = await post('[1,2]').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(400);
    });
  });
});
