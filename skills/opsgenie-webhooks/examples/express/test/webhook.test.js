const request = require('supertest');

// Set test environment variables before importing the app
process.env.OPSGENIE_WEBHOOK_HEADER = 'X-Opsgenie-Secret';
process.env.OPSGENIE_WEBHOOK_SECRET = 'test_opsgenie_secret_0123456789';

const app = require('../src/index');
const { verifyOpsgenieRequest } = require('../src/index');

const HEADER = process.env.OPSGENIE_WEBHOOK_HEADER;
const SECRET = process.env.OPSGENIE_WEBHOOK_SECRET;

const ACTIONS = [
  'Create', 'Acknowledge', 'UnAcknowledge', 'AddNote', 'AddTags', 'RemoveTags', 'Close',
  'AssignOwnership', 'TakeOwnership', 'Delete', 'Escalate', 'UpdatePriority',
  'UpdateDescription', 'UpdateMessage', 'AddTeam', 'AddRecipient'
];

function samplePayload(action = 'Create') {
  return {
    source: { name: 'web', type: 'API' },
    alert: {
      alertId: '052652ac-5d1c-464a-812a-7dd18bbfba8c',
      message: 'test alert',
      alias: 'aliastest',
      tinyId: '23',
      tags: ['tag1', 'tag2'],
      username: 'fili@ifountain.com',
      entity: ''
    },
    action,
    integrationId: '37c8f316-17c6-49d7-899b-9c7e540c048d',
    integrationName: 'Integration1'
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/opsgenie')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Opsgenie webhook endpoint', () => {
  describe('Custom header verification', () => {
    it('accepts the correct secret', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toUpperCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects an empty header value', async () => {
      const res = await post().set(HEADER, '');
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent in a different header', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', () => {
      expect(verifyOpsgenieRequest({ [HEADER.toLowerCase()]: SECRET }, HEADER, '')).toBe(false);
      expect(verifyOpsgenieRequest({ [HEADER.toLowerCase()]: SECRET }, HEADER, SECRET)).toBe(true);
    });

    it('compares non-ASCII values without throwing', () => {
      const h = { [HEADER.toLowerCase()]: 'sécret-ü' };
      expect(verifyOpsgenieRequest(h, HEADER, 'sécret-ü')).toBe(true);
      expect(verifyOpsgenieRequest(h, HEADER, 'secret-u')).toBe(false);
    });
  });

  describe('Default Authorization header and whole-value compare', () => {
    const bearer = `Bearer ${SECRET}`;

    it('defaults the header name to Authorization', () => {
      delete process.env.OPSGENIE_WEBHOOK_HEADER;
      try {
        expect(verifyOpsgenieRequest({ authorization: SECRET }, undefined, SECRET)).toBe(true);
      } finally {
        process.env.OPSGENIE_WEBHOOK_HEADER = HEADER;
      }
    });

    it('accepts the whole value including a Bearer prefix', () => {
      expect(verifyOpsgenieRequest({ authorization: bearer }, 'Authorization', bearer)).toBe(true);
    });

    it('does not strip the Bearer prefix', () => {
      expect(verifyOpsgenieRequest({ authorization: bearer }, 'Authorization', SECRET)).toBe(false);
      expect(verifyOpsgenieRequest({ authorization: SECRET }, 'Authorization', bearer)).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a credential', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Action handling', () => {
    it.each(ACTIONS)('handles %s', async (action) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(action))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Custom or unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('handles an Escalate payload that has no source object', async () => {
      const body = {
        action: 'Escalate',
        alert: { alertId: '7ba97e3a-d328-4b5e-8f9a-39e945a3869a' },
        escalationName: 'test_esc',
        escalationNotify: { name: 'test@ifountain.com', type: 'default', entity: 'user' }
      };
      const res = await post(JSON.stringify(body)).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('acknowledges custom action names', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('TestAction'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).includes('TestAction'))).toBe(true);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
