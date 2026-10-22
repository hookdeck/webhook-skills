const request = require('supertest');

// Set test environment variables before importing the app
process.env.ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME = 'X-My-Webhook-Secret';
process.env.ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE = 'test_assemblyai_secret_0123456789';

const app = require('../src/index');
const { verifyAssemblyAIRequest } = require('../src/index');

const NAME = process.env.ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME;
const VALUE = process.env.ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE;

// What AssemblyAI delivers: only the transcript ID and a status
function samplePayload(status = 'completed') {
  return { transcript_id: '5552493-16d8-42d8-8feb-c2a16b56f6e8', status };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/assemblyai')
    .set('Content-Type', contentType)
    .send(body);
}

describe('AssemblyAI webhook endpoint', () => {
  describe('Auth header', () => {
    it('accepts the correct header value', async () => {
      const res = await post().set(NAME, VALUE);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(NAME.toLowerCase(), VALUE);
      expect(res.status).toBe(200);
    });

    it('verifies regardless of content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(NAME, VALUE);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set(NAME, 'x'.repeat(VALUE.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set(NAME, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects when the header is missing', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects the value sent under a different header name', async () => {
      const res = await post().set('X-Other-Header', VALUE);
      expect(res.status).toBe(401);
    });
  });

  describe('Request handling', () => {
    it('returns 400 for an invalid JSON body', async () => {
      const res = await post('{not json').set(NAME, VALUE);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2,3]').set(NAME, VALUE);
      expect(res.status).toBe(400);
    });

    it('handles completed, error and unknown statuses', async () => {
      for (const status of ['completed', 'error', 'queued']) {
        const res = await post(JSON.stringify(samplePayload(status))).set(NAME, VALUE);
        expect(res.status).toBe(200);
      }
    });
  });

  describe('verifyAssemblyAIRequest', () => {
    it('rejects everything when nothing is configured', () => {
      expect(verifyAssemblyAIRequest({ '': '' }, {})).toBe(false);
      expect(verifyAssemblyAIRequest({ 'x-my-webhook-secret': 'abc' }, {})).toBe(false);
    });

    it('rejects when only the name is configured', () => {
      const config = { ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME: 'X-Token' };
      expect(verifyAssemblyAIRequest({ 'x-token': '' }, config)).toBe(false);
    });

    it('uses a custom header name', () => {
      const config = {
        ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME: 'X-AAI-Token',
        ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE: 's3cret',
      };
      expect(verifyAssemblyAIRequest({ 'x-aai-token': 's3cret' }, config)).toBe(true);
      expect(verifyAssemblyAIRequest({ 'x-my-webhook-secret': 's3cret' }, config)).toBe(false);
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
