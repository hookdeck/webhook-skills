import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

const SECRET = 'test_dbt_cloud_secret'; // dbt's hmac_secret is a raw string

beforeAll(() => {
  process.env.DBT_CLOUD_WEBHOOK_SECRET = SECRET;
});

// Real dbt Cloud algorithm: lowercase hex HMAC-SHA256 of the raw body, sent bare in Authorization
function sign(payload: string, secret: string = SECRET): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function makePayload(eventType: string): string {
  return JSON.stringify({
    accountId: 1,
    webhookId: 'wsu_12345abcde',
    eventId: 'wev_2L6Z3l8uPedXKPq9D2nWbPIip7Z',
    timestamp: '2023-01-31T19:28:15.742843678Z',
    eventType,
    webhookName: 'test',
    data: { jobId: '123', jobName: 'Daily Job (dbt build)', runId: '12345', runStatus: 'Success' },
  });
}

function makeRequest(payload: string, auth?: string) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (auth !== undefined) headers.set('Authorization', auth);
  return new Request('http://localhost/webhooks/dbt-cloud', {
    method: 'POST',
    headers,
    body: payload,
  });
}

describe('dbt Cloud Webhook Route', () => {
  it('returns 400 when the Authorization header is missing', async () => {
    const { POST } = await import('../app/webhooks/dbt-cloud/route');
    const res = await POST(makeRequest(makePayload('job.run.completed')) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const { POST } = await import('../app/webhooks/dbt-cloud/route');
    const res = await POST(makeRequest(makePayload('job.run.completed'), 'a'.repeat(64)) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a Bearer-prefixed signature', async () => {
    const { POST } = await import('../app/webhooks/dbt-cloud/route');
    const payload = makePayload('job.run.completed');
    const res = await POST(makeRequest(payload, `Bearer ${sign(payload)}`) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when signed with the wrong secret', async () => {
    const { POST } = await import('../app/webhooks/dbt-cloud/route');
    const payload = makePayload('job.run.completed');
    const res = await POST(makeRequest(payload, sign(payload, 'other')) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body is modified after signing', async () => {
    const { POST } = await import('../app/webhooks/dbt-cloud/route');
    const payload = makePayload('job.run.completed');
    const res = await POST(makeRequest(payload.replace('Success', 'Errored'), sign(payload)) as any);
    expect(res.status).toBe(400);
  });

  it.each(['job.run.started', 'job.run.completed', 'job.run.errored'])(
    'accepts a valid %s event',
    async (eventType) => {
      const { POST } = await import('../app/webhooks/dbt-cloud/route');
      const payload = makePayload(eventType);
      const res = await POST(makeRequest(payload, sign(payload)) as any);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    }
  );

  it('accepts an unknown event type with a valid signature', async () => {
    const { POST } = await import('../app/webhooks/dbt-cloud/route');
    const payload = makePayload('job.run.unknown');
    const res = await POST(makeRequest(payload, sign(payload)) as any);
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed but non-JSON body', async () => {
    const { POST } = await import('../app/webhooks/dbt-cloud/route');
    const res = await POST(makeRequest('not json', sign('not json')) as any);
    expect(res.status).toBe(400);
  });
});
