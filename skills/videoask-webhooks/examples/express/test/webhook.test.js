const request = require('supertest');

// Set test environment variables before importing the app
process.env.VIDEOASK_WEBHOOK_HEADER = 'secret';
process.env.VIDEOASK_WEBHOOK_SECRET = 'Bearer test_videoask_secret_0123456789';

const app = require('../src/index');
const { verifyVideoAskRequest } = require('../src/index');

const SECRET = process.env.VIDEOASK_WEBHOOK_SECRET;

const EVENTS = [
  'form_response',
  'form_response_transcribed',
  'form_author_message',
  'form_contact_message',
  'form_contact_tagged',
  'form_contact_untagged',
];

function samplePayload(eventType = 'form_response') {
  return {
    event_id: '7df19833701662b6414ed1765dcc626c',
    event_type: eventType,
    interaction_id: '386bbc0b-bb60-4b62-82fa-d630d0d2b83b',
    contact: {
      contact_id: '7c6550ff-fe15-424a-918e-2c1936db8aed',
      name: 'John Doe',
      email: 'john.doe@example.com',
      answers: [],
    },
    form: { form_id: '5a1b8066-f92c-47bf-b8f2-3beb0a738122', title: 'Example form' },
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/videoask')
    .set('Content-Type', contentType)
    .send(body);
}

describe('VideoAsk webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct value', async () => {
      const res = await post().set('secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('SECRET', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including a Bearer prefix', async () => {
      const res = await post().set('secret', SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set('secret', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set('secret', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await post().set('x-other', SECRET);
      expect(res.status).toBe(401);
    });

    it('supports a custom header name', () => {
      expect(
        verifyVideoAskRequest({ 'x-videoask-key': 'abc' }, { headerName: 'X-VideoAsk-Key', secret: 'abc' })
      ).toBe(true);
      expect(
        verifyVideoAskRequest({ 'x-videoask-key': 'abd' }, { headerName: 'X-VideoAsk-Key', secret: 'abc' })
      ).toBe(false);
    });

    it('rejects everything when the secret is unset', () => {
      expect(verifyVideoAskRequest({ secret: SECRET }, { secret: '' })).toBe(false);
      delete process.env.VIDEOASK_WEBHOOK_SECRET;
      expect(verifyVideoAskRequest({ secret: SECRET })).toBe(false);
      process.env.VIDEOASK_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set('secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(eventType))).set('secret', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('something_new'))).set('secret', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
