const request = require('supertest');

// Set test environment variables before importing the app
process.env.WORKSPACE_ONE_WEBHOOK_USERNAME = 'ws1-notify';
process.env.WORKSPACE_ONE_WEBHOOK_PASSWORD = 'p@ss:word-with-colon';

const app = require('../src/index');
const { verifyWorkspaceOneRequest } = require('../src/index');

const USER = process.env.WORKSPACE_ONE_WEBHOOK_USERNAME;
const PASS = process.env.WORKSPACE_ONE_WEBHOOK_PASSWORD;

const basic = (user, pass) => 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

// Placeholder body: Omnissa's page does not document the payload.
const BODY = '{"placeholder":"not a Workspace ONE payload"}';

function post(body = BODY, contentType = 'application/json') {
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
    it('accepts a JSON body', async () => {
      const res = await post().set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('accepts an XML body', async () => {
      const res = await post('<placeholder/>', 'application/xml').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await post(BODY, 'text/plain').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('stores a body it could not parse rather than rejecting it', async () => {
      const res = await post('{not json').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('returns 401 for an unauthenticated body', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });
});
