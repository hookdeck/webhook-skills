import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { POST, verifyMollieSignature } from '../app/webhooks/mollie/events/route';

// Next-gen Mollie webhooks: JSON events signed with
// `X-Mollie-Signature: sha256=<hex HMAC-SHA256 of the raw body>`.

const SECRET = 'test_signing_secret';

// Mollie's documented next-gen event example (payment-link.paid, simple payload).
const EVENT = JSON.stringify({
  resource: 'event',
  id: 'event_GvJ8WHrp5isUdRub9CJyH',
  type: 'payment-link.paid',
  entityId: 'pl_qng5gbbv8NAZ5gpM5ZYgx',
  createdAt: '2024-12-16T15:59:04.0Z',
  _links: {
    self: {
      href: 'https://api.mollie.com/v2/events/event_GvJ8WHrp5isUdRub9CJyH',
      type: 'application/hal+json',
    },
  },
});

function sign(body: string, secret = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, signatures: string[] = []): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const s of signatures) headers.append('x-mollie-signature', s);
  return new Request('http://localhost/webhooks/mollie/events', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyMollieSignature', () => {
  it('accepts a valid sha256= signature over the raw body', () => {
    expect(verifyMollieSignature(EVENT, sign(EVENT), SECRET)).toBe(true);
  });

  it('rejects a signature made with another secret', () => {
    expect(verifyMollieSignature(EVENT, sign(EVENT, 'other'), SECRET)).toBe(false);
  });

  it('accepts either of two comma-joined signatures (secret rotation)', () => {
    expect(verifyMollieSignature(EVENT, `${sign(EVENT, 'old')}, ${sign(EVENT)}`, SECRET)).toBe(true);
  });

  it('rejects a missing header or secret', () => {
    expect(verifyMollieSignature(EVENT, null, SECRET)).toBe(false);
    expect(verifyMollieSignature(EVENT, sign(EVENT), undefined)).toBe(false);
  });
});

describe('Mollie next-gen events route', () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.MOLLIE_WEBHOOK_SECRET;
    process.env.MOLLIE_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.MOLLIE_WEBHOOK_SECRET;
    else process.env.MOLLIE_WEBHOOK_SECRET = originalSecret;
  });

  it('returns 200 for a correctly signed event', async () => {
    const res = await POST(makeRequest(EVENT, [sign(EVENT)]) as never);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(EVENT) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signature made with the wrong secret', async () => {
    const res = await POST(makeRequest(EVENT, [sign(EVENT, 'wrong_secret')]) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body was modified after signing', async () => {
    const tampered = EVENT.replace('payment-link.paid', 'payment.paid');
    const res = await POST(makeRequest(tampered, [sign(EVENT)]) as never);
    expect(res.status).toBe(400);
  });

  it('accepts two signature headers during a secret rotation', async () => {
    const res = await POST(makeRequest(EVENT, [sign(EVENT, 'old_secret'), sign(EVENT)]) as never);
    expect(res.status).toBe(200);
  });

  it.each(['payment.paid', 'payment.failed', 'payout.completed', 'some.future_event'])(
    'returns 200 and handles event type %s',
    async (type) => {
      const body = JSON.stringify({ ...JSON.parse(EVENT), type, entityId: 'tr_abc123' });
      const res = await POST(makeRequest(body, [sign(body)]) as never);
      expect(res.status).toBe(200);
    }
  );

  it('returns 500 when MOLLIE_WEBHOOK_SECRET is not set (never fails open)', async () => {
    delete process.env.MOLLIE_WEBHOOK_SECRET;
    const res = await POST(makeRequest(EVENT, [sign(EVENT)]) as never);
    expect(res.status).toBe(500);
  });
});
