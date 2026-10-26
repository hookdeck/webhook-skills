const request = require('supertest');

// Set test environment variables before importing the app
process.env.AZURE_DEVOPS_WEBHOOK_USERNAME = 'ado-hook-user';
process.env.AZURE_DEVOPS_WEBHOOK_PASSWORD = 'p@ss:word/with:colons';

const app = require('../src/index');
const { verifyAzureDevOpsRequest, parseBasicAuth } = require('../src/index');

const USER = process.env.AZURE_DEVOPS_WEBHOOK_USERNAME;
const PASS = process.env.AZURE_DEVOPS_WEBHOOK_PASSWORD;

function basic(user, pass, scheme = 'Basic') {
  return `${scheme} ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

const EVENTS = [
  'git.push', 'git.pullrequest.created', 'git.pullrequest.updated', 'git.pullrequest.merged',
  'workitem.created', 'workitem.updated', 'workitem.commented', 'build.complete',
  'ms.vss-pipelines.run-state-changed-event'
];

function samplePayload(eventType = 'git.push') {
  return {
    subscriptionId: '00000000-0000-0000-0000-000000000000',
    notificationId: 1,
    id: 'a0a0a0a0-bbbb-cccc-dddd-e1e1e1e1e1e1',
    eventType,
    publisherId: 'tfs',
    message: { text: 'Jamal Hartnett pushed updates to branch main.', html: '', markdown: '' },
    detailedMessage: { text: '', html: '', markdown: '' },
    resource: { pushId: 14 },
    resourceVersion: '1.0',
    resourceContainers: { project: { id: '00aa00aa-bb11-cc22-dd33-44ee44ee44ee' } },
    createdDate: '2024-09-19T13:03:27.0379153Z'
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/azure-devops')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Azure DevOps webhook endpoint', () => {
  describe('basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await post().set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts the scheme in any case', async () => {
      const res = await post().set('Authorization', basic(USER, PASS, 'bAsIc'));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon only (password may contain colons)', () => {
      const parsed = parseBasicAuth(basic('user', 'a:b:c'));
      expect(parsed.username.toString()).toBe('user');
      expect(parsed.password.toString()).toBe('a:b:c');
    });

    it('rejects a wrong password', async () => {
      const res = await post().set('Authorization', basic(USER, 'wrong'));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await post().set('Authorization', basic('someone-else', PASS));
      expect(res.status).toBe(401);
    });

    it('rejects when both are wrong', async () => {
      const res = await post().set('Authorization', basic('x', 'y'));
      expect(res.status).toBe(401);
    });

    it('rejects values of different length without throwing', async () => {
      const res = await post().set('Authorization', basic('u', 'p'));
      expect(res.status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/^Basic/);
    });

    it('rejects a non-Basic scheme', async () => {
      const res = await post().set('Authorization', `Bearer ${PASS}`);
      expect(res.status).toBe(401);
    });

    it('rejects invalid base64', async () => {
      const res = await post().set('Authorization', 'Basic !!!not-base64!!!');
      expect(res.status).toBe(401);
    });

    it('rejects credentials with trailing junk after the base64', async () => {
      const res = await post().set('Authorization', `${basic(USER, PASS)} extra`);
      expect(res.status).toBe(401);
    });

    it('rejects credentials without a colon', async () => {
      const res = await post().set(
        'Authorization',
        `Basic ${Buffer.from('nocolon').toString('base64')}`
      );
      expect(res.status).toBe(401);
    });

    it('handles non-ASCII credentials without throwing', async () => {
      const res = await post().set('Authorization', basic('üser', 'pässwörd'));
      expect(res.status).toBe(401);
    });

    it('fails closed when credentials are not configured', () => {
      expect(verifyAzureDevOpsRequest({ authorization: basic('', '') }, '', '')).toBe(false);
    });

    it('rejects every request when the environment variables are unset', async () => {
      delete process.env.AZURE_DEVOPS_WEBHOOK_USERNAME;
      delete process.env.AZURE_DEVOPS_WEBHOOK_PASSWORD;
      try {
        const res = await post().set('Authorization', basic(USER, PASS));
        expect(res.status).toBe(401);
      } finally {
        process.env.AZURE_DEVOPS_WEBHOOK_USERNAME = USER;
        process.env.AZURE_DEVOPS_WEBHOOK_PASSWORD = PASS;
      }
    });

    it('verifies against explicit credentials', () => {
      expect(verifyAzureDevOpsRequest({ authorization: basic('a', 'b') }, 'a', 'b')).toBe(true);
      expect(verifyAzureDevOpsRequest({ authorization: basic('a', 'b') }, 'a', 'c')).toBe(false);
    });
  });

  describe('body handling', () => {
    it('authenticates before parsing: bad credentials + bad JSON is 401, not 400', async () => {
      const res = await post('not json', 'application/json').set('Authorization', basic(USER, 'wrong'));
      expect(res.status).toBe(401);
    });

    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('accepts application/json; charset=utf-8', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'application/json; charset=utf-8')
        .set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON after authentication', async () => {
      const res = await post('{"eventType": ', 'application/json').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(400);
    });

    it('rejects two concatenated JSON objects (as in the docs build.complete sample)', async () => {
      const body = `${JSON.stringify(samplePayload('build.complete'))}${JSON.stringify(samplePayload('build.complete'))}`;
      const res = await post(body).set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(400);
    });

    it('rejects a JSON array', async () => {
      const res = await post('[]').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(400);
    });
  });

  describe('events', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const res = await post(JSON.stringify(samplePayload(eventType)))
        .set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('accepts an unknown event type', async () => {
      const res = await post(JSON.stringify(samplePayload('tfvc.checkin')))
        .set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });
  });

  describe('health', () => {
    it('GET /health returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
