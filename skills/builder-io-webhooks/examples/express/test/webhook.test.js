const request = require('supertest');

// Set test environment variables before importing the app
process.env.BUILDER_IO_WEBHOOK_HEADER = 'X-Builder-Secret';
process.env.BUILDER_IO_WEBHOOK_SECRET = 'Bearer test_builder_secret_0123456789';

const app = require('../src/index');
const { verifyBuilderRequest } = require('../src/index');

const HEADER = process.env.BUILDER_IO_WEBHOOK_HEADER;
const SECRET = process.env.BUILDER_IO_WEBHOOK_SECRET;

const OPERATIONS = ['publish', 'unpublish', 'archive', 'delete', 'scheduledStart', 'scheduledEnd'];

function samplePayload(operation = 'publish') {
  return {
    newValue: operation === 'delete' ? null : { id: 'cs3df', published: 'published', name: 'My great page', data: { property: 'value' } },
    previousValue: operation === 'publish' ? null : { id: 'cs3df', published: 'draft', name: 'My great page' },
    modelName: 'page',
    operation,
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/builder-io')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Builder.io webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
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

    it('rejects the secret sent under a different header', async () => {
      const res = await post().set('X-Other', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects a bad secret before parsing the body', async () => {
      const res = await post('not json').set(HEADER, 'wrong');
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts a +json content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'application/vnd.builder+json').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await post('not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await post('[]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });
  });

  describe('operations', () => {
    it.each(OPERATIONS)('handles %s', async (operation) => {
      const res = await post(JSON.stringify(samplePayload(operation))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('acknowledges an unknown operation', async () => {
      const res = await post(JSON.stringify({ ...samplePayload(), operation: 'mystery' })).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });
  });

  describe('verifyBuilderRequest', () => {
    it('defaults to the Authorization header', () => {
      delete process.env.BUILDER_IO_WEBHOOK_HEADER;
      try {
        expect(verifyBuilderRequest({ authorization: SECRET })).toBe(true);
        expect(verifyBuilderRequest({ [HEADER.toLowerCase()]: SECRET })).toBe(false);
      } finally {
        process.env.BUILDER_IO_WEBHOOK_HEADER = HEADER;
      }
    });

    it('fails closed when no secret is configured', () => {
      expect(verifyBuilderRequest({ [HEADER.toLowerCase()]: '' }, { header: HEADER, secret: '' })).toBe(false);
      expect(verifyBuilderRequest({ [HEADER.toLowerCase()]: 'undefined' }, { header: HEADER, secret: undefined })).toBe(false);
    });

    it('handles non-ASCII values', () => {
      expect(verifyBuilderRequest({ x: 'päss' }, { header: 'X', secret: 'päss' })).toBe(true);
      expect(verifyBuilderRequest({ x: 'päss' }, { header: 'X', secret: 'pass' })).toBe(false);
    });
  });

  it('responds to /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
