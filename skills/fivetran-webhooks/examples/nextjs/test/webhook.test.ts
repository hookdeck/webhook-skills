import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const secret = 'test_fivetran_secret';

/**
 * Generate a Fivetran signature: HMAC-SHA256 hex of the raw body.
 * Fivetran's example uses uppercase hex; pass upper=false for lowercase.
 */
function sign(payload: string, key: string = secret, upper = true): string {
  const hex = crypto.createHmac('sha256', key).update(payload).digest('hex');
  return upper ? hex.toUpperCase() : hex;
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['x-fivetran-signature-256'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/fivetran', {
    method: 'POST',
    headers,
    body,
  });
}

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.FIVETRAN_WEBHOOK_SECRET = secret;
  ({ POST } = await import('../app/webhooks/fivetran/route'));
});

describe('Fivetran webhook route', () => {
  it('returns 400 for missing signature', async () => {
    const res = await POST(makeRequest(JSON.stringify({ event: 'sync_end' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid signature', async () => {
    const res = await POST(makeRequest(JSON.stringify({ event: 'sync_end' }), 'DEADBEEF'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  it('returns 400 for signature from a different secret', async () => {
    const body = JSON.stringify({ event: 'sync_end' });
    const res = await POST(makeRequest(body, sign(body, 'other_secret')));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body was modified after signing', async () => {
    const sig = sign(JSON.stringify({ event: 'sync_end' }));
    const res = await POST(makeRequest(JSON.stringify({ event: 'sync_start' }), sig));
    expect(res.status).toBe(400);
  });

  it.each([
    ['sync_start', { event: 'sync_start', connector_id: 'c1', sync_id: 's1' }],
    ['sync_end', { event: 'sync_end', connector_id: 'c1', sync_id: 's1', data: { status: 'SUCCESSFUL' } }],
    ['status', { event: 'status', connector_id: 'c1', data: {} }],
    ['transformation_start', { event: 'transformation_start', data: {} }],
    ['transformation_succeeded', { event: 'transformation_succeeded', data: {} }],
    ['transformation_failed', { event: 'transformation_failed', data: {} }],
    ['connection_successful', { event: 'connection_successful', connector_id: 'c1', data: {} }],
    ['connection_failure', { event: 'connection_failure', connector_id: 'c1', data: {} }],
  ])('returns 200 for valid %s event', async (_name, obj) => {
    const body = JSON.stringify(obj);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a lowercase signature', async () => {
    const body = JSON.stringify({ event: 'sync_end', data: { status: 'FAILED' } });
    const res = await POST(makeRequest(body, sign(body, secret, false)));
    expect(res.status).toBe(200);
  });

  it('returns 200 for unhandled events', async () => {
    const body = JSON.stringify({ event: 'pause_connector', connector_id: 'c1' });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });
});
