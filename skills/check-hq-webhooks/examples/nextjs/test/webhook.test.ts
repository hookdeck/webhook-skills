import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Check keys are 40 hex characters but are used as plain UTF-8 text
const KEY = '4f541ff5350323b6ba6ca4e96873e6f4cb9fd144';

import { POST } from '../app/webhooks/check-hq/route';
import { verifyCheckWebhook } from '../lib/check';

beforeAll(() => {
  process.env.CHECK_WEBHOOK_KEY = KEY;
});

// Same algorithm as Check: hex HMAC-SHA256 of the raw body, key as UTF-8 text
function sign(payload: string, secret = KEY): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function makeRequest(
  body: object | string,
  opts: { topic?: string; signature?: string | null; contentType?: string } = {}
): NextRequest {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const headers: Record<string, string> = {
    'content-type': opts.contentType ?? 'application/json',
    'check-topic': opts.topic ?? 'payroll',
    'check-webhookevent-id': 'whe_test123',
    'check-live': 'false',
  };
  if (opts.signature !== null) headers['check-signature'] = opts.signature ?? sign(raw);
  return new NextRequest('http://localhost:3000/webhooks/check-hq', { method: 'POST', headers, body: raw });
}

describe('verifyCheckWebhook', () => {
  const body = '{"event":"updated","data":{}}';

  it('accepts a valid signature', () => {
    expect(verifyCheckWebhook(body, sign(body), KEY)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifyCheckWebhook(body, sign(body).toUpperCase(), KEY)).toBe(true);
  });

  it('rejects a signature made with the hex-decoded key', () => {
    const wrong = crypto.createHmac('sha256', Buffer.from(KEY, 'hex')).update(body).digest('hex');
    expect(verifyCheckWebhook(body, wrong, KEY)).toBe(false);
  });

  it('rejects a base64 signature', () => {
    const b64 = crypto.createHmac('sha256', KEY).update(body).digest('base64');
    expect(verifyCheckWebhook(body, b64, KEY)).toBe(false);
  });

  it('rejects a wrong or missing signature', () => {
    expect(verifyCheckWebhook(body, 'deadbeef', KEY)).toBe(false);
    expect(verifyCheckWebhook(body, null, KEY)).toBe(false);
  });
});

describe('POST /webhooks/check-hq', () => {
  it('returns 400 for a missing signature', async () => {
    const res = await POST(makeRequest({ event: 'updated', data: { id: 'pay_1' } }, { signature: null }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest({ event: 'updated', data: { id: 'pay_1' } }, { signature: 'a'.repeat(64) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body is modified after signing', async () => {
    const signature = sign(JSON.stringify({ event: 'updated', data: { id: 'pay_1' } }));
    const res = await POST(makeRequest({ event: 'updated', data: { id: 'pay_2' } }, { signature }));
    expect(res.status).toBe(400);
  });

  it('handles payroll updated', async () => {
    const res = await POST(makeRequest({ event: 'updated', data: { id: 'pay_Z26PNMC7Ky1wfFQzVqfF', status: 'paid' } }));
    expect(res.status).toBe(200);
  });

  it('handles payment status_change', async () => {
    const res = await POST(
      makeRequest({ event: 'status_change', data: { id: 'pyt_vIFHhvyGN47ej1upyIT8', status: 'paid' } }, { topic: 'payment' })
    );
    expect(res.status).toBe(200);
  });

  it('handles employee created', async () => {
    const res = await POST(makeRequest({ event: 'created', data: { id: 'emp_zGGp6wYcxAeu1Ng8IA7v' } }, { topic: 'employee' }));
    expect(res.status).toBe(200);
  });

  it('verifies any content type (text/plain)', async () => {
    const res = await POST(
      makeRequest({ event: 'created', data: { id: 'emp_1' } }, { topic: 'employee', contentType: 'text/plain' })
    );
    expect(res.status).toBe(200);
  });

  it('handles the flat ping body', async () => {
    const res = await POST(makeRequest({ message: 'Test webhook' }, { topic: 'ping' }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for unhandled events', async () => {
    const res = await POST(makeRequest({ event: 'created', data: { id: 'doc_1' } }, { topic: 'employee_tax_document' }));
    expect(res.status).toBe(200);
  });

  it('returns 400 for signed but invalid JSON', async () => {
    const res = await POST(makeRequest('not json'));
    expect(res.status).toBe(400);
  });
});
