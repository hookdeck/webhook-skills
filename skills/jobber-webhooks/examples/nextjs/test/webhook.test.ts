import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const CLIENT_SECRET = 'test_jobber_client_secret';

// Set test environment variables before the route reads them
beforeAll(() => {
  process.env.JOBBER_CLIENT_SECRET = CLIENT_SECRET;
});

// Jobber signs the raw body: base64(HMAC-SHA256(rawBody, clientSecret))
function sign(payload: string, secret: string = CLIENT_SECRET): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64');
}

function samplePayload(topic = 'CLIENT_CREATE'): string {
  return JSON.stringify({
    data: {
      webHookEvent: {
        topic,
        appId: '3ef22a50-072d-430c-a78f-b7646657560b',
        accountId: 'MQ==',
        itemId: 'MQ==',
        occurredAt: '2026-07-16T16:31:31-06:00',
      },
    },
  });
}

function makeRequest(body: string, signature?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-jobber-hmac-sha256'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/jobber', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /webhooks/jobber', () => {
  it('returns 200 for a valid CLIENT_CREATE webhook', async () => {
    const { POST } = await import('../app/webhooks/jobber/route');
    const payload = samplePayload('CLIENT_CREATE');
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(200);
  });

  it.each(['INVOICE_UPDATE', 'APP_CONNECT', 'APP_DISCONNECT', 'SOMETHING_ELSE'])(
    'returns 200 for %s',
    async (topic) => {
      const { POST } = await import('../app/webhooks/jobber/route');
      const payload = samplePayload(topic);
      const res = await POST(makeRequest(payload, sign(payload)));
      expect(res.status).toBe(200);
    }
  );

  it('verifies regardless of content type', async () => {
    const { POST } = await import('../app/webhooks/jobber/route');
    const payload = samplePayload();
    const res = await POST(makeRequest(payload, sign(payload), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 401 for an invalid signature', async () => {
    const { POST } = await import('../app/webhooks/jobber/route');
    const res = await POST(makeRequest(samplePayload(), sign('different body')));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature of the wrong length', async () => {
    const { POST } = await import('../app/webhooks/jobber/route');
    const res = await POST(makeRequest(samplePayload(), 'short'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a valid signature with trailing junk', async () => {
    const { POST } = await import('../app/webhooks/jobber/route');
    const payload = samplePayload();
    const res = await POST(makeRequest(payload, sign(payload) + 'xx'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a missing signature', async () => {
    const { POST } = await import('../app/webhooks/jobber/route');
    const res = await POST(makeRequest(samplePayload()));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const { POST } = await import('../app/webhooks/jobber/route');
    const res = await POST(makeRequest('not json', sign('not json'), 'text/plain'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when webHookEvent is missing', async () => {
    const { POST } = await import('../app/webhooks/jobber/route');
    const payload = JSON.stringify({ data: {} });
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(400);
  });
});
