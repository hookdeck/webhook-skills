import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const secret = 'test_signing_secret_abc123';

/** Returnless signs the raw body: HMAC-SHA256, lowercase hex, in X-Signature. */
function sign(payload: string, key: string = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function makeRequest(
  body: string,
  signature?: string,
  event: string | null = 'return.created',
  contentType = 'application/json'
): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-signature'] = signature;
  if (event) headers['x-event-name'] = event;
  return new NextRequest('http://localhost:3000/webhooks/returnless', {
    method: 'POST',
    headers,
    body,
  });
}

const body = JSON.stringify({ data: { id: 'return_12vM04vDdaQQJHxWprprL0IX', resource_type: 'return' } });

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.RETURNLESS_WEBHOOK_SECRET = secret;
  ({ POST } = await import('../app/webhooks/returnless/route'));
});

afterEach(() => {
  process.env.RETURNLESS_WEBHOOK_SECRET = secret;
});

describe('Returnless webhook route', () => {
  it('accepts a valid signature', async () => {
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const res = await POST(makeRequest(body, sign(body).toUpperCase()));
    expect(res.status).toBe(200);
  });

  it.each([
    'request.created',
    'request.approved',
    'request.approved_with_manual_shipment',
    'request.approved_without_shipment',
    'request.rejected',
    'return.product.marked_as_received',
    'shipment.delivered',
    'return.notes.added', // not specially handled: logged
  ])('handles %s', async (event) => {
    const res = await POST(makeRequest(body, sign(body), event));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes for any content type', async () => {
    const res = await POST(makeRequest(body, sign(body), 'return.created', 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('verifies bodies whose whitespace would change on re-serialization', async () => {
    const spaced = '{ "data" :  { "id": "return_1" } }\n';
    const res = await POST(makeRequest(spaced, sign(spaced)));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    const res = await POST(makeRequest(body, ''));
    expect(res.status).toBe(401);
  });

  it('rejects a signature signed with the wrong secret', async () => {
    const res = await POST(makeRequest(body, sign(body, 'other_secret')));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(makeRequest(body.replace('return_', 'retur_'), sign(body)));
    expect(res.status).toBe(401);
  });

  it('rejects a prefixed signature', async () => {
    const res = await POST(makeRequest(body, `sha256=${sign(body)}`));
    expect(res.status).toBe(401);
  });

  it('rejects malformed signatures (wrong length or non-hex)', async () => {
    for (const bad of [sign(body).slice(0, 62), sign(body) + '00', 'z'.repeat(64)]) {
      const res = await POST(makeRequest(body, bad));
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const bad = 'not json';
    const res = await POST(makeRequest(bad, sign(bad)));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.RETURNLESS_WEBHOOK_SECRET;
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(500);
  });
});
