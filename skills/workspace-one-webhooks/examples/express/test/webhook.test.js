const request = require('supertest');

// Set test environment variables before importing the app
process.env.WORKSPACE_ONE_WEBHOOK_USERNAME = 'ws1-notify';
process.env.WORKSPACE_ONE_WEBHOOK_PASSWORD = 'p@ss:word-with-colon';

const app = require('../src/index');
const { verifyWorkspaceOneRequest } = require('../src/index');

const USER = process.env.WORKSPACE_ONE_WEBHOOK_USERNAME;
const PASS = process.env.WORKSPACE_ONE_WEBHOOK_PASSWORD;

const EVENTS = [
  'Check-in/Check-out', 'Device Attribute Change', 'Device Compliance Status Change',
  'Device Compromised Status Change', 'Device Delete', 'Device Enrollment',
  'Device Unenrolled Enterprise Wipe', 'Device Wipe'
];

const basic = (user, pass) => 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

// Illustrative body: Omnissa's page does not document the payload.
function samplePayload(eventType = 'Device Enrollment') {
  return { EventType: eventType, DeviceId: 4821, EnrollmentUserName: 'jdoe' };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/workspace-one')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Workspace ONE webhook endpoint', () => {
  describe('Basic auth verification', () => {
    it('accepts the correct credentials', async () => {
      const res = await post().set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts a case-insensitive scheme and splits on the first colon', async () => {
      const header = 'bAsIc ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
      const res = await post().set('Authorization', header);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong password', async () => {
      const res = await post().set('Authorization', basic(USER, 'wrong'));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await post().set('Authorization', basic('someone-else', PASS));
      expect(res.status).toBe(401);
    });

    it('rejects a password truncated at its first colon', async () => {
      const res = await post().set('Authorization', basic(USER, PASS.split(':')[0]));
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

    it('rejects malformed base64 and credentials without a colon', async () => {
      expect((await post().set('Authorization', 'Basic !!!not-base64!!!')).status).toBe(401);
      const noColon = 'Basic ' + Buffer.from('justausername').toString('base64');
      expect((await post().set('Authorization', noColon)).status).toBe(401);
    });

    it('handles non-ASCII credentials without throwing', async () => {
      const res = await post().set('Authorization', basic('usér', 'pässwörd'));
      expect(res.status).toBe(401);
    });

    it('verifyWorkspaceOneRequest rejects when unconfigured', () => {
      expect(verifyWorkspaceOneRequest({ authorization: basic(USER, PASS) }, '', '')).toBe(false);
      expect(verifyWorkspaceOneRequest({ authorization: basic('', '') }, '', '')).toBe(false);
    });
  });

  describe('Body handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const res = await post(JSON.stringify(samplePayload(eventType))).set(
        'Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('accepts an unknown event type', async () => {
      const res = await post(JSON.stringify(samplePayload('Something New'))).set(
        'Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('accepts an XML body', async () => {
      const xml = '<Event><EventType>Device Wipe</EventType><DeviceId>4821</DeviceId></Event>';
      const res = await post(xml, 'application/xml').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(
        'Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON with 400 after authenticating', async () => {
      const res = await post('{not json').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(400);
    });

    it('rejects a non-object JSON body with 400', async () => {
      const res = await post('[1,2]').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for an unauthenticated invalid body', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });
});
