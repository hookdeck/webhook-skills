const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.TASKADE_WEBHOOK_SECRET = 'test_taskade_secret';

const { app, verifyTaskadeWebhook } = require('../src/index');

/**
 * Generate a valid Taskade signature for testing (sha256=<hex> of the raw body)
 */
function generateTaskadeSignature(payload, secret) {
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${digest}`;
}

const taskDue = { event: 'task.due', task: { id: 't_1', title: 'Ship it' } };

describe('Taskade Webhook Endpoint', () => {
  const secret = process.env.TASKADE_WEBHOOK_SECRET;

  describe('verifyTaskadeWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"event":"task.due"}');
      expect(verifyTaskadeWebhook(payload, generateTaskadeSignature(payload, secret), secret)).toBe(true);
    });

    it('should accept the bare digest without the prefix', () => {
      const payload = Buffer.from('{"event":"task.due"}');
      const bare = generateTaskadeSignature(payload, secret).slice('sha256='.length);
      expect(verifyTaskadeWebhook(payload, bare, secret)).toBe(true);
    });

    it('should accept an uppercase hex digest', () => {
      const payload = Buffer.from('{"event":"task.due"}');
      const sig = generateTaskadeSignature(payload, secret).toUpperCase().replace('SHA256=', 'sha256=');
      expect(verifyTaskadeWebhook(payload, sig, secret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"event":"task.due"}');
      expect(verifyTaskadeWebhook(payload, 'sha256=invalid', secret)).toBe(false);
    });

    it('should return false for a signature of the right length with bad characters', () => {
      const payload = Buffer.from('{}');
      expect(verifyTaskadeWebhook(payload, 'sha256=' + 'zz'.repeat(32), secret)).toBe(false);
    });

    it('should return false for a signature made with another secret', () => {
      const payload = Buffer.from('{}');
      expect(verifyTaskadeWebhook(payload, generateTaskadeSignature(payload, 'other'), secret)).toBe(false);
    });

    it('should return false for missing or empty signature', () => {
      const payload = Buffer.from('{}');
      expect(verifyTaskadeWebhook(payload, undefined, secret)).toBe(false);
      expect(verifyTaskadeWebhook(payload, '', secret)).toBe(false);
    });

    it('should return false when no secret is configured', () => {
      const payload = Buffer.from('{}');
      expect(verifyTaskadeWebhook(payload, generateTaskadeSignature(payload, secret), undefined)).toBe(false);
    });

    it('should verify the raw bytes, not re-serialized JSON', () => {
      const payload = Buffer.from('{ "event" : "task.due",  "task": {} }');
      expect(verifyTaskadeWebhook(payload, generateTaskadeSignature(payload, secret), secret)).toBe(true);
    });
  });

  describe('POST /webhooks/taskade', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/taskade')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(taskDue));

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/taskade')
        .set('Content-Type', 'application/json')
        .set('X-Taskade-Signature', 'sha256=invalid')
        .send(JSON.stringify(taskDue));

      expect(response.status).toBe(401);
    });

    it.each(['task.due', 'task.assigned', 'comment.created', 'project.created', 'project.joined'])(
      'should return 200 for a valid %s event',
      async (event) => {
        const payload = JSON.stringify({ event });

        const response = await request(app)
          .post('/webhooks/taskade')
          .set('Content-Type', 'application/json')
          .set('X-Taskade-Signature', generateTaskadeSignature(payload, secret))
          .send(payload);

        expect(response.status).toBe(200);
        expect(response.text).toBe('OK');
      }
    );

    it('should read the event from a type field too', async () => {
      const payload = JSON.stringify({ type: 'task.due' });

      const response = await request(app)
        .post('/webhooks/taskade')
        .set('Content-Type', 'application/json')
        .set('X-Taskade-Signature', generateTaskadeSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should verify a body sent with another content type', async () => {
      const payload = '{"event":"task.due"}';

      const response = await request(app)
        .post('/webhooks/taskade')
        .set('Content-Type', 'text/plain')
        .set('X-Taskade-Signature', generateTaskadeSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should verify pretty-printed JSON that JSON.stringify would change', async () => {
      const payload = JSON.stringify(taskDue, null, 4);

      const response = await request(app)
        .post('/webhooks/taskade')
        .set('Content-Type', 'application/json')
        .set('X-Taskade-Signature', generateTaskadeSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should return 400 for a validly signed non-JSON body', async () => {
      const payload = 'not json';

      const response = await request(app)
        .post('/webhooks/taskade')
        .set('Content-Type', 'text/plain')
        .set('X-Taskade-Signature', generateTaskadeSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
