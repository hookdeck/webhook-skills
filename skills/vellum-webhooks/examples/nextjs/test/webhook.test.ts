import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/vellum/route';
import { verifyVellumRequest } from '../lib/verify-vellum';

const SECRET = 'Bearer test_vellum_token_0123456789';

const EVENTS = [
  'workflow.execution.initiated',
  'workflow.execution.fulfilled',
  'workflow.execution.rejected',
  'workflow_execution.usage_calculation.fulfilled',
  'workflow_execution.usage_calculation.rejected',
  'metric.execution.fulfilled',
];

beforeAll(() => {
  process.env.VELLUM_WEBHOOK_HEADER = 'Authorization';
  process.env.VELLUM_WEBHOOK_SECRET = SECRET;
});

let counter = 0;
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

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  const hasBody = body !== null && method !== 'GET';
  return new NextRequest('http://localhost:3000/webhooks/vellum', {
    method,
    headers: { ...(hasBody ? { 'content-type': contentType } : {}), ...headers },
    body: hasBody ? body : undefined,
  });
}

describe('/webhooks/vellum', () => {
  describe('credential verification', () => {
    it('accepts the correct credential', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest('POST', { Authorization: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest('POST', { Authorization: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing credential', async () => {
      const res = await POST(makeRequest('POST'));
      expect(res.status).toBe(401);
    });

    it('rejects when no secret is configured', () => {
      expect(verifyVellumRequest(new Headers({ authorization: 'anything' }), '')).toBe(false);
    });

    it('supports a custom header name, case-insensitively', () => {
      expect(verifyVellumRequest(new Headers({ 'x-api-key': 'k' }), 'k', 'X-API-Key')).toBe(true);
      expect(verifyVellumRequest(new Headers({ 'x-api-key': 'k' }), 'k', 'X-Other')).toBe(false);
    });
  });

  describe('methods', () => {
    const handlers = { GET, POST, PUT, PATCH, DELETE };
    for (const [method, handler] of Object.entries(handlers)) {
      it(`accepts ${method} with the credential`, async () => {
        const res = await handler(makeRequest(method, { Authorization: SECRET }));
        expect(res.status).toBe(200);
      });

      it(`rejects ${method} without the credential`, async () => {
        const res = await handler(makeRequest(method));
        expect(res.status).toBe(401);
      });
    }

    it('accepts an empty body after authenticating', async () => {
      const res = await GET(makeRequest('GET', { Authorization: SECRET }, null));
      expect(res.status).toBe(200);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest('POST', { Authorization: SECRET }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON with 400', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, '{nope'));
      expect(res.status).toBe(400);
    });

    it('rejects a non-object body with 400', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, '[1]'));
      expect(res.status).toBe(400);
    });

    it('authenticates before parsing', async () => {
      const res = await POST(makeRequest('POST', {}, '{nope'));
      expect(res.status).toBe(401);
    });
  });

  describe('events', () => {
    for (const name of EVENTS) {
      it(`handles ${name}`, async () => {
        const res = await POST(makeRequest('POST', { Authorization: SECRET }, JSON.stringify(samplePayload(name))));
        expect(res.status).toBe(200);
      });
    }

    it('acknowledges unknown events', async () => {
      const res = await POST(
        makeRequest('POST', { Authorization: SECRET }, JSON.stringify(samplePayload('something.else')))
      );
      expect(res.status).toBe(200);
    });

    it('dedupes on id', async () => {
      const body = JSON.stringify(samplePayload());
      await POST(makeRequest('POST', { Authorization: SECRET }, body));
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, body));
      expect(res.status).toBe(200);
      expect((await res.json()).duplicate).toBe(true);
    });
  });
});
