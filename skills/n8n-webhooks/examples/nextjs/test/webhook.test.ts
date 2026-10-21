import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/n8n/route';
import { verifyN8nRequest } from '../lib/verify-n8n';

const SECRET = 'test_n8n_shared_secret_0123456789';

beforeAll(() => {
  process.env.N8N_WEBHOOK_SECRET = SECRET;
  process.env.N8N_WEBHOOK_HEADER = 'X-Webhook-Secret';
  process.env.N8N_BASIC_AUTH_USER = 'n8n';
  process.env.N8N_BASIC_AUTH_PASSWORD = 'test_basic_password';
});

// What an n8n HTTP Request node would send with Body Content Type = JSON
function samplePayload(event = 'order.created') {
  return {
    event,
    id: 'exec_1042',
    data: { order_id: 'ord_123', email: 'jane@example.com', workflow_name: 'Orders sync' },
  };
}

function basic(user: string, password: string): string {
  return 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/n8n', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/n8n', () => {
  describe('Header auth', () => {
    it('accepts the correct secret header', async () => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': 'short' }));
      expect(res.status).toBe(401);
    });
  });

  describe('Bearer auth', () => {
    it('accepts Authorization: Bearer <secret>', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${SECRET}` }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong bearer token', async () => {
      const res = await POST(makeRequest({ Authorization: 'Bearer not-the-secret' }));
      expect(res.status).toBe(401);
    });
  });

  describe('Basic auth', () => {
    it('accepts the configured username and password', async () => {
      const res = await POST(makeRequest({ Authorization: basic('n8n', 'test_basic_password') }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong password', async () => {
      const res = await POST(makeRequest({ Authorization: basic('n8n', 'wrong') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await POST(makeRequest({ Authorization: basic('admin', 'test_basic_password') }));
      expect(res.status).toBe(401);
    });
  });

  describe('Request handling', () => {
    it('returns 401 when no credentials are sent', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('returns 400 for an invalid JSON body', async () => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': SECRET }, '[1,2,3]'));
      expect(res.status).toBe(400);
    });

    it('handles every example event and unknown events', async () => {
      const events = ['lead.created', 'order.created', 'workflow.completed', 'workflow.failed', 'something.else'];
      for (const event of events) {
        const res = await POST(
          makeRequest({ 'X-Webhook-Secret': SECRET }, JSON.stringify(samplePayload(event)))
        );
        expect(res.status).toBe(200);
      }
    });
  });
});

describe('verifyN8nRequest', () => {
  it('rejects everything when no secret or basic credentials are configured', () => {
    expect(verifyN8nRequest(new Headers({ 'x-webhook-secret': '' }), {})).toBe(false);
    expect(verifyN8nRequest(new Headers({ authorization: 'Bearer ' }), {})).toBe(false);
    expect(verifyN8nRequest(new Headers({ authorization: basic('', '') }), {})).toBe(false);
  });

  it('uses a custom header name', () => {
    const config = { N8N_WEBHOOK_SECRET: 's3cret', N8N_WEBHOOK_HEADER: 'X-N8N-Token' };
    expect(verifyN8nRequest(new Headers({ 'x-n8n-token': 's3cret' }), config)).toBe(true);
    expect(verifyN8nRequest(new Headers({ 'x-webhook-secret': 's3cret' }), config)).toBe(false);
  });
});
