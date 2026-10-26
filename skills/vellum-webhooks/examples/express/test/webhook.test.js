const request = require('supertest');

// Set test environment variables before importing the app
process.env.VELLUM_WEBHOOK_HEADER = 'Authorization';
process.env.VELLUM_WEBHOOK_SECRET = 'Bearer test_vellum_token_0123456789';

const app = require('../src/index');
const { verifyVellumRequest } = require('../src/index');

const SECRET = process.env.VELLUM_WEBHOOK_SECRET;
let counter = 0;

const EVENTS = [
  'workflow.execution.initiated',
  'workflow.execution.fulfilled',
  'workflow.execution.rejected',
  'workflow_execution.usage_calculation.fulfilled',
  'workflow_execution.usage_calculation.rejected',
  'metric.execution.fulfilled',
];

function samplePayload(name = 'workflow.execution.fulfilled') {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    timestamp: '2026-10-26T12:00:00Z',
    api_version: '2024-10-25',
    trace_id: '11111111-1111-4111-8111-111111111111',
    span_id: '22222222-2222-4222-8222-222222222222',
    parent: null,
    name,
    body: { workflow_class: { name: 'MyWorkflow', module: ['my', 'workflow'], bases: [] }, outputs: {} },
  };
}

function send(method, payload = samplePayload(), contentType = 'application/json') {
  return request(app)[method]('/webhooks/vellum').set('Content-Type', contentType).send(JSON.stringify(payload));
}

describe('Vellum webhook endpoint', () => {
  describe('credential verification', () => {
    it('accepts the correct credential', async () => {
      const res = await send('post').set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await send('post').set('Authorization', SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await send('post').set('Authorization', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await send('post').set('Authorization', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing credential', async () => {
      const res = await send('post');
      expect(res.status).toBe(401);
    });

    it('rejects when no secret is configured', () => {
      expect(verifyVellumRequest({ authorization: 'anything' }, '')).toBe(false);
    });

    it('supports a custom header name, case-insensitively', () => {
      expect(verifyVellumRequest({ 'x-api-key': 'k' }, 'k', 'X-API-Key')).toBe(true);
      expect(verifyVellumRequest({ 'x-api-key': 'k' }, 'k', 'X-Other')).toBe(false);
    });
  });

  describe('methods', () => {
    it.each(['get', 'post', 'put', 'patch', 'delete'])('accepts %s with the credential', async (method) => {
      const res = await send(method).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it.each(['get', 'post', 'put', 'patch', 'delete'])('rejects %s without the credential', async (method) => {
      const res = await send(method);
      expect(res.status).toBe(401);
    });

    it('accepts an empty body after authenticating', async () => {
      const res = await request(app).get('/webhooks/vellum').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await send('post', samplePayload(), 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON with 400', async () => {
      const res = await request(app)
        .post('/webhooks/vellum')
        .set('Authorization', SECRET)
        .set('Content-Type', 'application/json')
        .send('{nope');
      expect(res.status).toBe(400);
    });

    it('rejects a non-object body with 400', async () => {
      const res = await request(app)
        .post('/webhooks/vellum')
        .set('Authorization', SECRET)
        .set('Content-Type', 'application/json')
        .send('[1]');
      expect(res.status).toBe(400);
    });

    it('does not parse the body before authenticating', async () => {
      const res = await request(app)
        .post('/webhooks/vellum')
        .set('Content-Type', 'application/json')
        .send('{nope');
      expect(res.status).toBe(401);
    });
  });

  describe('events', () => {
    it.each(EVENTS)('handles %s', async (name) => {
      const res = await send('post', samplePayload(name)).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('acknowledges unknown events', async () => {
      const res = await send('post', samplePayload('something.else')).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('dedupes on id', async () => {
      const payload = samplePayload();
      await send('post', payload).set('Authorization', SECRET);
      const res = await send('post', payload).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body.duplicate).toBe(true);
    });
  });
});
