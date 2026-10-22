import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';

const apiKey = 'test_acuity_api_key';

// Set test environment variables before the route is imported
beforeAll(() => {
  process.env.ACUITY_API_KEY = apiKey;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// Acuity: base64 HMAC-SHA256 of the raw body, keyed with the account API key
function sign(body: string, key: string = apiKey): string {
  return crypto.createHmac('sha256', key).update(body).digest('base64');
}

function makeRequest(body: string, signature?: string, contentType = 'application/x-www-form-urlencoded') {
  const headers = new Headers({ 'Content-Type': contentType });
  if (signature) headers.set('X-Acuity-Signature', signature);
  return new Request('http://localhost/webhooks/acuity-scheduling', {
    method: 'POST',
    headers,
    body,
  });
}

const body = 'action=scheduled&id=13&calendarID=1&appointmentTypeID=13';

describe('Acuity Scheduling Webhook Route', () => {
  it('returns 400 for a missing signature header', async () => {
    const { POST } = await import('../app/webhooks/acuity-scheduling/route');
    const res = await POST(makeRequest(body) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const { POST } = await import('../app/webhooks/acuity-scheduling/route');
    const res = await POST(makeRequest(body, 'invalid') as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when signed with the wrong key', async () => {
    const { POST } = await import('../app/webhooks/acuity-scheduling/route');
    const res = await POST(makeRequest(body, sign(body, 'other_key')) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body is tampered with', async () => {
    const { POST } = await import('../app/webhooks/acuity-scheduling/route');
    const res = await POST(makeRequest(body.replace('id=13', 'id=14'), sign(body)) as any);
    expect(res.status).toBe(400);
  });

  it.each(['scheduled', 'rescheduled', 'canceled', 'changed', 'order.completed'])(
    'accepts a validly signed %s action',
    async (action) => {
      const { POST } = await import('../app/webhooks/acuity-scheduling/route');
      const payload = `action=${action}&id=13&calendarID=1&appointmentTypeID=13`;
      const res = await POST(makeRequest(payload, sign(payload)) as any);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    }
  );

  it('verifies regardless of content type', async () => {
    const { POST } = await import('../app/webhooks/acuity-scheduling/route');
    const res = await POST(makeRequest(body, sign(body), 'text/plain') as any);
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown actions', async () => {
    const { POST } = await import('../app/webhooks/acuity-scheduling/route');
    const payload = 'action=something.else&id=1';
    const res = await POST(makeRequest(payload, sign(payload)) as any);
    expect(res.status).toBe(200);
  });
});
