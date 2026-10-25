const request = require('supertest');

// Set test environment variables before importing the app
process.env.DOCUMENT360_WEBHOOK_HEADER = 'X-Docs-Secret';
process.env.DOCUMENT360_WEBHOOK_SECRET = 'Bearer test_document360_secret_0123456789';

const app = require('../src/index');
const { verifyDocument360Request } = require('../src/index');

const HEADER = process.env.DOCUMENT360_WEBHOOK_HEADER;
const SECRET = process.env.DOCUMENT360_WEBHOOK_SECRET;

const EVENTS = [
  'Article published', 'Article created', 'Article deleted', 'Article settings saved',
  'Article workflow status updated', 'Extension token deleted'
];

function samplePayload(event = 'Article published') {
  return {
    'Knowledge base name': 'Document360 2.0',
    Event: event,
    User: 'Matt Sterling',
    'User email': 'matt.sterling@document360.co',
    'Logged on (UTC)': '09/12/2025 06:15:00',
    'Article name': 'Getting Started',
    'Article id': 'e1444f0x-0xx0-000x-xxx0-0x3f2bc3713c',
    Language: 'English',
    'Language code': 'en'
  };
}

function send(method, body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  const req = request(app)[method]('/webhooks/document360');
  if (contentType) req.set('Content-Type', contentType);
  return body === undefined ? req : req.send(body);
}

describe('Document360 webhook endpoint', () => {
  describe('credential header verification', () => {
    it('accepts the correct header value on POST', async () => {
      const res = await send('post').set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts the correct header value on PUT', async () => {
      const res = await send('put').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('matches the header name case-insensitively', async () => {
      const res = await send('post').set('x-docs-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, prefix included', async () => {
      const res = await send('post').set(HEADER, SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await send('post').set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await send('post').set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await send('post');
      expect(res.status).toBe(401);
    });

    it('rejects a credential sent under a different header name', async () => {
      const res = await send('post').set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects a non-ASCII value without throwing', async () => {
      const res = await send('post').set(HEADER, Buffer.from('séçrét', 'utf8').toString('latin1'));
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing the body', async () => {
      const res = await send('post', 'not json');
      expect(res.status).toBe(401);
    });
  });

  describe('verifyDocument360Request', () => {
    it('fails closed when no secret is configured', () => {
      expect(verifyDocument360Request({ 'x-docs-secret': 'anything' }, '', HEADER)).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.DOCUMENT360_WEBHOOK_HEADER;
      try {
        expect(verifyDocument360Request({ authorization: SECRET }, SECRET)).toBe(true);
        expect(verifyDocument360Request({ 'x-docs-secret': SECRET }, SECRET)).toBe(false);
      } finally {
        process.env.DOCUMENT360_WEBHOOK_HEADER = HEADER;
      }
    });
  });

  describe('request handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const res = await send('post', JSON.stringify(samplePayload(event))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('handles an unknown event', async () => {
      const res = await send('post', JSON.stringify(samplePayload('Something new'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('handles the article delete payload with Slugs', async () => {
      const body = JSON.stringify({
        ...samplePayload('Article deleted'),
        Slugs: [{ language: 'en', slug: 'getting-started' }]
      });
      const res = await send('post', body).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await send('post', JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts an empty body when authenticated', async () => {
      const res = await send('post', undefined, null).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON with 400', async () => {
      const res = await send('post', 'not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('rejects a non-object body with 400', async () => {
      const res = await send('post', '[1,2]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('does not accept GET on the webhook route', async () => {
      const res = await request(app).get('/webhooks/document360').set(HEADER, SECRET);
      expect(res.status).toBe(404);
    });
  });
});
