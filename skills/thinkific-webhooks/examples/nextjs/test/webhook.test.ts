import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/thinkific/route';
import { verifyThinkificSignature } from '../lib/verify-thinkific';

const SECRET = 'test_thinkific_secret_0123456789';

beforeAll(() => {
  process.env.THINKIFIC_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// What Thinkific sends: lowercase hex HMAC-SHA256 of the raw body, no prefix
function sign(body: string | Buffer, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Based on the documented order.created sample
const orderCreated = {
  id: '20180126172320940835610',
  resource: 'order',
  action: 'created',
  tenant_id: '3',
  created_at: '2018-01-26T22:23:20.808Z',
  payload: {
    id: 19796,
    order_number: 1010,
    amount_cents: 5000,
    product_name: 'Introduction to Webhooks',
    user: { id: 123456, email: 'ninjas@thinkific.com' },
  },
};

// Based on the documented enrollment.completed sample
const enrollmentCompleted = {
  id: '01JTVB3ZXNK1M928X2MMZ5CJ2X',
  resource: 'enrollment',
  action: 'completed',
  tenant_id: '445230',
  created_at: '2025-05-09T20:17:20.000Z',
  timestamp: 1746821840,
  payload: { id: 652268044, user: { id: 222244858 }, course: { id: 3093805, name: 'Introduction to Webhooks' } },
};

function makeRequest(
  body: string,
  headers: Record<string, string> = {},
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/thinkific', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/thinkific', () => {
  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const body = JSON.stringify(orderCreated);
      const res = await POST(makeRequest(body, { 'x-thinkific-hmac-sha256': sign(body) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts an uppercase hex signature (hex is case-insensitive)', async () => {
      const body = JSON.stringify(orderCreated);
      const res = await POST(makeRequest(body, { 'x-thinkific-hmac-sha256': sign(body).toUpperCase() }));
      expect(res.status).toBe(200);
    });

    it('verifies the exact raw bytes, not re-serialised JSON', async () => {
      // Odd spacing and a non-ASCII name: JSON.stringify(JSON.parse(body)) would differ
      const body = '{ "id": "1",  "resource": "user", "action": "signup",\n  "payload": { "id": 7, "first_name": "Zoë" } }';
      const res = await POST(makeRequest(body, { 'x-thinkific-hmac-sha256': sign(Buffer.from(body, 'utf8')) }));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const body = JSON.stringify(orderCreated);
      const res = await POST(makeRequest(body, { 'x-thinkific-hmac-sha256': sign(body) }, 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature header', async () => {
      const res = await POST(makeRequest(JSON.stringify(orderCreated)));
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature header', async () => {
      const res = await POST(makeRequest(JSON.stringify(orderCreated), { 'x-thinkific-hmac-sha256': '' }));
      expect(res.status).toBe(401);
    });

    it('rejects a signature for a different body', async () => {
      const res = await POST(
        makeRequest(JSON.stringify(orderCreated), {
          'x-thinkific-hmac-sha256': sign(JSON.stringify(enrollmentCompleted)),
        })
      );
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const body = JSON.stringify(orderCreated);
      const res = await POST(makeRequest(body, { 'x-thinkific-hmac-sha256': sign(body, 'another-secret-0123456789') }));
      expect(res.status).toBe(401);
    });

    it('rejects a malformed signature (wrong length or non-hex characters)', async () => {
      const body = JSON.stringify(orderCreated);
      const good = sign(body);
      for (const bad of [good.slice(0, 62), good + '00', 'z'.repeat(64), `sha256=${good}`]) {
        const res = await POST(makeRequest(body, { 'x-thinkific-hmac-sha256': bad }));
        expect(res.status).toBe(401);
      }
    });

    it('rejects a body modified after signing', async () => {
      const body = JSON.stringify(orderCreated);
      const res = await POST(makeRequest(body.replace('5000', '1'), { 'x-thinkific-hmac-sha256': sign(body) }));
      expect(res.status).toBe(401);
    });
  });

  describe('fixed test vector', () => {
    const body =
      '{"id":"20180126172320940835610","resource":"order","action":"created","tenant_id":"3","created_at":"2018-01-26T22:23:20.808Z","payload":{"id":19796,"order_number":1010,"billing_name":"Zoë Smith","amount_cents":5000,"product_name":"Introduction to Webhooks"}}';
    const digest = '37203a0607cb973af0fef64b8eabb95b761b537e592b7a86d3293a285978e6c6';

    it('matches a fixed digest for a fixed secret and body', () => {
      expect(verifyThinkificSignature(Buffer.from(body, 'utf8'), digest, SECRET)).toBe(true);
    });

    it('rejects everything when the secret is not configured', () => {
      expect(verifyThinkificSignature(Buffer.from(body, 'utf8'), digest, '')).toBe(false);
    });
  });

  describe('event handling', () => {
    const events = [
      orderCreated,
      enrollmentCompleted,
      { id: '2', resource: 'user', action: 'signup', payload: { id: 1 } },
      { id: '3', resource: 'course', action: 'updated', payload: { id: 2 } },
      { id: '4', resource: 'order_transaction', action: 'refunded', payload: { id: 3 } },
      { id: '5', resource: 'lesson', action: 'completed', payload: { id: 4 } },
      { name: 'cart.abandoned', version: 1, data: { id: 'c1' } },
    ];

    it.each(events)('acknowledges %j', async (event) => {
      const body = JSON.stringify(event);
      const res = await POST(makeRequest(body, { 'x-thinkific-hmac-sha256': sign(body) }));
      expect(res.status).toBe(200);
    });

    it('returns 400 for a signed body that is not JSON', async () => {
      const body = 'not json';
      const res = await POST(makeRequest(body, { 'x-thinkific-hmac-sha256': sign(body) }, 'text/plain'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a signed JSON array', async () => {
      const body = '[1,2]';
      const res = await POST(makeRequest(body, { 'x-thinkific-hmac-sha256': sign(body) }));
      expect(res.status).toBe(400);
    });
  });
});
