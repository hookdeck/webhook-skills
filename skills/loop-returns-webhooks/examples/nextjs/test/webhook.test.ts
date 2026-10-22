import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'loop_test_secret_key';

// Loop signs the raw body: base64(HMAC-SHA256(secret, body))
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.LOOP_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/loop-returns/route'));
});

function makeRequest(
  payload: object | string,
  { signature, secret, contentType = 'application/json' }: { signature?: string | null; secret?: string; contentType?: string } = {}
) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== null) headers['x-loop-signature'] = signature ?? sign(body, secret);
  return new NextRequest('http://localhost:3000/webhooks/loop-returns', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /webhooks/loop-returns', () => {
  it.each([
    'return.created',
    'return.updated',
    'return.closed',
    'return.processing.failed',
    'label.created',
    'label.updated',
    'restock.requested',
    'giftcard.requested',
    'shipment.processed',
  ])('accepts %s', async (trigger) => {
    const res = await POST(makeRequest({ topic: trigger.split('.')[0], trigger, id: '1673' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an unknown trigger', async () => {
    const res = await POST(makeRequest({ topic: 'return', trigger: 'return.something_new' }));
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const res = await POST(
      makeRequest({ topic: 'return', trigger: 'return.created' }, { contentType: 'text/plain' })
    );
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, including escaped slashes', async () => {
    const res = await POST(
      makeRequest('{"topic":"return","trigger":"return.created","note":"a\\/b"}')
    );
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(makeRequest({ trigger: 'return.created' }, { signature: 'bogus' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await POST(makeRequest({ trigger: 'return.created' }, { secret: 'wrong' }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const original = JSON.stringify({ trigger: 'return.created' });
    const res = await POST(
      makeRequest({ trigger: 'return.closed' }, { signature: sign(original) })
    );
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest({ trigger: 'return.created' }, { signature: null }));
    expect(res.status).toBe(400);
  });

  it('rejects a validly signed body that is not JSON', async () => {
    const res = await POST(makeRequest('not json'));
    expect(res.status).toBe(400);
  });
});
