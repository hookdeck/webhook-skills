import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_convex_hmac_secret';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.CONVEX_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/convex/route'));
});

function digest(body: string, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function sign(body: string, secret = SECRET) {
  return 'sha256=' + digest(body, secret);
}

const NOW = 1715879172882;
const convex = { deployment_name: 'happy-animal-123', deployment_type: 'prod', project_name: 'my-app', project_slug: 'my-app' };

function sampleBatch() {
  return JSON.stringify([
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

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-webhook-signature'] = signature;
  return new NextRequest('http://localhost/webhooks/convex', { method: 'POST', headers, body });
}

describe('Convex log stream webhook', () => {
  it('accepts a valid batch with sha256= prefix', async () => {
    const body = sampleBatch();
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts the bare digest without the prefix', async () => {
    const body = sampleBatch();
    expect((await POST(makeRequest(body, digest(body)))).status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    const body = sampleBatch();
    expect((await POST(makeRequest(body, 'sha256=' + digest(body).toUpperCase()))).status).toBe(200);
  });

  it('verifies any content type (raw body)', async () => {
    const body = sampleBatch();
    expect((await POST(makeRequest(body, sign(body), 'text/plain'))).status).toBe(200);
  });

  it('verifies the exact bytes, not re-serialized JSON', async () => {
    const body = '[ { "topic" : "verification",  "timestamp": 1715879172882 } ]\n';
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('accepts unhandled topics with a valid signature', async () => {
    const body = JSON.stringify([{ topic: 'concurrency_stats', timestamp: NOW, convex }]);
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('accepts a JSONL body', async () => {
    const body = '{"topic":"verification","timestamp":1}\n{"topic":"audit_log","timestamp":2}\n';
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('rejects missing signature', async () => {
    expect((await POST(makeRequest(sampleBatch()))).status).toBe(401);
  });

  it('rejects empty signature', async () => {
    expect((await POST(makeRequest(sampleBatch(), ''))).status).toBe(401);
  });

  it('rejects wrong secret', async () => {
    const body = sampleBatch();
    expect((await POST(makeRequest(body, sign(body, 'wrong_secret')))).status).toBe(401);
  });

  it('rejects tampered body', async () => {
    const body = sampleBatch();
    expect((await POST(makeRequest(body.replace('message:list', 'message:evil'), sign(body)))).status).toBe(401);
  });

  it('rejects malformed signatures', async () => {
    const body = sampleBatch();
    const good = digest(body);
    for (const bad of ['sha256=', 'sha256=zz' + good.slice(2), 'sha256=' + good.slice(1), 'sha256=' + good + '00', 'sha1=' + good]) {
      expect((await POST(makeRequest(body, bad))).status).toBe(401);
    }
  });

  it('rejects a valid signature over a non-JSON body with 400', async () => {
    const body = 'not json';
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(400);
  });
});
