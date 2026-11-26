const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.TASKADE_WEBHOOK_SECRET = 'test_taskade_secret';

const { app, verifyTaskadeWebhook, taskadeEventType } = require('../src/index');

/**
 * Generate a valid X-Taskade-Signature-V2 value: sha256=<hex> of "<timestamp>.<raw body>"
 */
function generateTaskadeSignature(payload, timestamp, secret) {
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `sha256=${digest}`;
}

function now() {
  return String(Math.floor(Date.now() / 1000));
}

// Test bodies use field names from Taskade's Delivery payload table with placeholder values
const bodies = {
  'task.due': { projectId: 'p_test', id: 'n_test', text: 'test', taskEndDate: 'test' },
  'task.assigned': { projectId: 'p_test', assignedNodes: [], nodes: [] },
  'comment.created': { projectId: 'p_test', nodeId: 'n_test', commentBody: 'test' },
  'project.created': { projectId: 'p_test', creatorName: 'test' },
  'project.assigned': { projectId: 'p_test', assigneeId: 'u_test' },
  'project.joined': { projectId: 'p_test', joinerUserId: 'u_test' },
};

describe('Taskade Webhook Endpoint', () => {
  const secret = process.env.TASKADE_WEBHOOK_SECRET;

  describe('verifyTaskadeWebhook', () => {
    const payload = Buffer.from('{"projectId":"p_test"}');

    it('should return true for a valid signature', () => {
      const ts = now();
      expect(verifyTaskadeWebhook(payload, generateTaskadeSignature(payload, ts, secret), ts, secret)).toBe(true);
    });

    it('should accept the bare digest without the prefix', () => {
      const ts = now();
      const bare = generateTaskadeSignature(payload, ts, secret).slice('sha256='.length);
      expect(verifyTaskadeWebhook(payload, bare, ts, secret)).toBe(true);
    });

    it('should return false for a timestamp more than 5 minutes old', () => {
      const ts = String(Math.floor(Date.now() / 1000) - 301);
      expect(verifyTaskadeWebhook(payload, generateTaskadeSignature(payload, ts, secret), ts, secret)).toBe(false);
    });

    it('should return false when the timestamp header was changed', () => {
      const ts = now();
      const sig = generateTaskadeSignature(payload, ts, secret);
      expect(verifyTaskadeWebhook(payload, sig, String(Number(ts) + 1), secret)).toBe(false);
    });

    it('should return false for a body-only signature', () => {
      const ts = now();
      const bodyOnly = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
      expect(verifyTaskadeWebhook(payload, bodyOnly, ts, secret)).toBe(false);
    });

    it('should return false for invalid or non-hex signatures', () => {
      const ts = now();
      expect(verifyTaskadeWebhook(payload, 'sha256=invalid', ts, secret)).toBe(false);
      expect(verifyTaskadeWebhook(payload, 'sha256=' + 'zz'.repeat(32), ts, secret)).toBe(false);
    });

    it('should return false for a signature made with another secret', () => {
      const ts = now();
      expect(verifyTaskadeWebhook(payload, generateTaskadeSignature(payload, ts, 'other'), ts, secret)).toBe(false);
    });

    it('should return false for missing headers or secret', () => {
      const ts = now();
      const sig = generateTaskadeSignature(payload, ts, secret);
      expect(verifyTaskadeWebhook(payload, undefined, ts, secret)).toBe(false);
      expect(verifyTaskadeWebhook(payload, sig, undefined, secret)).toBe(false);
      expect(verifyTaskadeWebhook(payload, sig, 'abc', secret)).toBe(false);
      expect(verifyTaskadeWebhook(payload, sig, ts, undefined)).toBe(false);
    });
  });

  describe('taskadeEventType', () => {
    it.each(Object.entries(bodies))('should identify %s from its fields', (event, body) => {
      expect(taskadeEventType(body)).toBe(event);
    });

    it('should return undefined for an unrecognised body', () => {
      expect(taskadeEventType({ projectId: 'p_test' })).toBeUndefined();
      expect(taskadeEventType([])).toBeUndefined();
    });
  });

  describe('POST /webhooks/taskade', () => {
    function signed(payload, ts = now()) {
      return {
        'Content-Type': 'application/json',
        'X-Taskade-Timestamp': ts,
        'X-Taskade-Signature-V2': generateTaskadeSignature(payload, ts, secret),
      };
    }

    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/taskade')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(bodies['task.due']));

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/taskade')
        .set('Content-Type', 'application/json')
        .set('X-Taskade-Timestamp', now())
        .set('X-Taskade-Signature-V2', 'sha256=invalid')
        .send(JSON.stringify(bodies['task.due']));

      expect(response.status).toBe(401);
    });

    it.each(Object.keys(bodies))('should return 200 for a valid %s delivery', async (event) => {
      const payload = JSON.stringify(bodies[event]);
      const response = await request(app).post('/webhooks/taskade').set(signed(payload)).send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should verify pretty-printed JSON that JSON.stringify would change', async () => {
      const payload = JSON.stringify(bodies['comment.created'], null, 4);
      const response = await request(app).post('/webhooks/taskade').set(signed(payload)).send(payload);

      expect(response.status).toBe(200);
    });

    it('should return 400 for a validly signed non-JSON body', async () => {
      const payload = 'not json';
      const response = await request(app)
        .post('/webhooks/taskade')
        .set({ ...signed(payload), 'Content-Type': 'text/plain' })
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
