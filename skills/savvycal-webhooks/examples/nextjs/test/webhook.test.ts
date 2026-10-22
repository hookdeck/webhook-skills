import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// SavvyCal secrets are opaque strings; any value works for tests
const SECRET = 'test_savvycal_webhook_secret';

// Real SavvyCal algorithm: HMAC-SHA256 over the raw body, hex encoded
function sign(body: string, secret: string = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const payload = JSON.stringify({ type: 'event.created', id: 'payload_TEST123' });

let POST: (req: NextRequest) => Promise<Response>;
let verifySavvyCalSignature: typeof import('../lib/savvycal').verifySavvyCalSignature;

beforeAll(async () => {
  process.env.SAVVYCAL_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/savvycal/route'));
  ({ verifySavvyCalSignature } = await import('../lib/savvycal'));
});

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/savvycal', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifySavvyCalSignature', () => {
  it('accepts a bare lowercase hex digest', () => {
    expect(verifySavvyCalSignature(payload, sign(payload), SECRET)).toBe(true);
  });

  it('accepts a bare uppercase hex digest (Elixir sample style)', () => {
    expect(verifySavvyCalSignature(payload, sign(payload).toUpperCase(), SECRET)).toBe(true);
  });

  it('accepts the sha256= prefix with uppercase hex (docs header example)', () => {
    expect(verifySavvyCalSignature(payload, `sha256=${sign(payload).toUpperCase()}`, SECRET)).toBe(true);
  });

  it('rejects a wrong secret, tampered body, and malformed signatures', () => {
    expect(verifySavvyCalSignature(payload, sign(payload, 'other'), SECRET)).toBe(false);
    expect(verifySavvyCalSignature(payload + ' ', sign(payload), SECRET)).toBe(false);
    expect(verifySavvyCalSignature(payload, 'abc123', SECRET)).toBe(false);
    expect(verifySavvyCalSignature(payload, 'zz'.repeat(32), SECRET)).toBe(false);
    expect(verifySavvyCalSignature(payload, '', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/savvycal', () => {
  it('returns 200 for a valid signature with sha256= prefix', async () => {
    const res = await POST(
      makeRequest(payload, {
        'content-type': 'application/json',
        'x-savvycal-signature': `sha256=${sign(payload).toUpperCase()}`,
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const res = await POST(
      makeRequest(payload, { 'content-type': 'text/plain', 'x-savvycal-signature': sign(payload) })
    );
    expect(res.status).toBe(200);
  });

  it.each([
    'event.created',
    'event.rescheduled',
    'event.canceled',
    'event.changed',
    'event.checkout.completed',
    'event.checkout.pending',
  ])('handles %s', async (type) => {
    const body = JSON.stringify({ type, id: 'payload_TEST123' });
    const res = await POST(
      makeRequest(body, { 'content-type': 'application/json', 'x-savvycal-signature': sign(body) })
    );
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(
      makeRequest(payload, {
        'content-type': 'application/json',
        'x-savvycal-signature': sign(payload, 'wrong'),
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(payload, { 'content-type': 'application/json' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed body that is not valid JSON', async () => {
    const body = 'not json';
    const res = await POST(
      makeRequest(body, { 'content-type': 'text/plain', 'x-savvycal-signature': sign(body) })
    );
    expect(res.status).toBe(400);
  });
});
