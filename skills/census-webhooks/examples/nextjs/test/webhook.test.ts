import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const secret = 'census_test_secret_8f2d1c';

/** Census signs the raw body: HMAC-SHA256, standard base64, in X-Signature. */
function sign(payload: string, key: string = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('base64');
}

function makeRequest(body: string, signature?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature) headers['x-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/census', {
    method: 'POST',
    headers,
    body,
  });
}

const base = { workspace_id: 3167, sync_id: 3167956, sync_run_id: 324399613 };

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.CENSUS_WEBHOOK_SECRET = secret;
  ({ POST } = await import('../app/webhooks/census/route'));
});

describe('Census webhook route', () => {
  it('returns 400 for missing signature', async () => {
    const res = await POST(makeRequest(JSON.stringify({ ...base, event: 'sync.started' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid signature', async () => {
    const res = await POST(makeRequest(JSON.stringify({ ...base, event: 'sync.started' }), 'bm9wZQ=='));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  it('returns 400 for a hex-encoded signature', async () => {
    const body = JSON.stringify({ ...base, event: 'sync.started' });
    const hex = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const res = await POST(makeRequest(body, hex));
    expect(res.status).toBe(400);
  });

  it('returns 400 for signature from a different secret', async () => {
    const body = JSON.stringify({ ...base, event: 'sync.started' });
    const res = await POST(makeRequest(body, sign(body, 'other_secret')));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body is altered after signing', async () => {
    const sig = sign(JSON.stringify({ ...base, event: 'sync.success' }));
    const res = await POST(makeRequest(JSON.stringify({ ...base, event: 'sync.failed' }), sig));
    expect(res.status).toBe(400);
  });

  const events: Array<Record<string, unknown>> = [
    { ...base, event: 'sync.triggered' },
    { ...base, event: 'sync.started' },
    { ...base, event: 'sync.completed', status: 'ok' },
    { ...base, event: 'sync.completed', status: 'emergency' },
    { ...base, event: 'sync.success' },
    { ...base, event: 'sync.failed' },
    {
      ...base,
      alert_instance_id: 626248,
      alert_type: 'FailureAlertConfiguration',
      message: 'Sync Failed',
      details: 'Sync has failed with error: A mapped source column has been deleted: email',
      followup_url: 'https://app.getcensus.com/workspaces/3167/syncs/3167956/sync-history',
      event: 'sync.alert.raised',
    },
    { ...base, alert_instance_id: 626248, alert_type: 'FailureAlertConfiguration', message: 'Sync Recovered', details: 'Sync has recovered', event: 'sync.alert.resolved' },
  ];

  for (const payload of events) {
    it(`accepts a signed ${payload.event} event`, async () => {
      const body = JSON.stringify(payload);
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });
  }

  it('verifies regardless of Content-Type', async () => {
    const body = JSON.stringify({ ...base, event: 'sync.success' });
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('verifies against the exact bytes, including whitespace', async () => {
    const body = '{ "workspace_id" : 3167 , "event" : "sync.started" }';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('accepts unknown events once signed', async () => {
    const body = JSON.stringify({ ...base, event: 'sync.something_new' });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed non-JSON body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(400);
  });
});
