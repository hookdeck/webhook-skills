const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_convex_hmac_secret';
process.env.CONVEX_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');

function digest(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function sign(body, secret = SECRET) {
  return 'sha256=' + digest(body, secret);
}

const NOW = 1715879172882;
const convex = { deployment_name: 'happy-animal-123', deployment_type: 'prod', project_name: 'my-app', project_slug: 'my-app' };

function batch(events) {
  return JSON.stringify(events);
}

function sampleBatch() {
  return batch([
    { topic: 'verification', timestamp: NOW, convex, message: 'Convex webhook verification' },
    {
      topic: 'console', timestamp: NOW, convex, log_level: 'LOG', message: "'Sent message!'",
      function: { path: 'messages:send', request_id: 'd064ef901f7ec0b7', type: 'mutation' },
    },
    {
      topic: 'function_execution', timestamp: NOW, convex, status: 'success', execution_time_ms: 294,
      function: { path: 'message:list', request_id: '892104e63bd39d9a', type: 'query', cached: false },
    },
    { topic: 'audit_log', timestamp: NOW, convex, audit_log_action: 'push_config', audit_log_metadata: '{}' },
    { topic: 'scheduler_stats', timestamp: NOW, convex, lag_seconds: 0, num_running_jobs: 1 },
    { topic: 'current_storage_usage', timestamp: NOW, convex, total_document_size_bytes: 104857600 },
  ]);
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/convex').set('Content-Type', contentType);
  if (signature !== undefined) req.set('x-webhook-signature', signature);
  return req.send(body);
}

describe('Convex log stream webhook', () => {
  test('accepts a valid batch with sha256= prefix', async () => {
    const body = sampleBatch();
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('accepts the bare digest without the prefix', async () => {
    const body = sampleBatch();
    const res = await post(body, digest(body));
    expect(res.status).toBe(200);
  });

  test('accepts an uppercase hex digest', async () => {
    const body = sampleBatch();
    const res = await post(body, 'sha256=' + digest(body).toUpperCase());
    expect(res.status).toBe(200);
  });

  test('verifies any content type (raw body)', async () => {
    const body = sampleBatch();
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  test('verifies the exact bytes, not re-serialized JSON', async () => {
    const body = '[ { "topic" : "verification",  "timestamp": 1715879172882 } ]\n';
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('accepts unhandled topics with a valid signature', async () => {
    const body = batch([{ topic: 'concurrency_stats', timestamp: NOW, convex }]);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('accepts a JSONL body', async () => {
    const body = '{"topic":"verification","timestamp":1}\n{"topic":"audit_log","timestamp":2}\n';
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('rejects missing signature', async () => {
    const res = await post(sampleBatch());
    expect(res.status).toBe(401);
  });

  test('rejects empty signature', async () => {
    const res = await post(sampleBatch(), '');
    expect(res.status).toBe(401);
  });

  test('rejects wrong secret', async () => {
    const body = sampleBatch();
    const res = await post(body, sign(body, 'wrong_secret'));
    expect(res.status).toBe(401);
  });

  test('rejects tampered body', async () => {
    const body = sampleBatch();
    const res = await post(body.replace('message:list', 'message:evil'), sign(body));
    expect(res.status).toBe(401);
  });

  test('rejects malformed signatures', async () => {
    const body = sampleBatch();
    const good = digest(body);
    for (const bad of ['sha256=', 'sha256=zz' + good.slice(2), 'sha256=' + good.slice(1), 'sha256=' + good + '00', 'sha1=' + good]) {
      const res = await post(body, bad);
      expect(res.status).toBe(401);
    }
  });

  test('rejects a valid signature over a non-JSON body with 400', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });
});
