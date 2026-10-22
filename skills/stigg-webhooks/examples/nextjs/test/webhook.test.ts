import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyStiggSecret, POST } from '../app/webhooks/stigg/route';

const SECRET = 'test_stigg_webhook_secret_123';

beforeEach(() => {
  process.env.STIGG_WEBHOOK_SECRET = SECRET;
});

function makeRequest(body: unknown, secretHeader?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (secretHeader) headers['Stigg-Webhooks-Secret'] = secretHeader;
  return new NextRequest('http://localhost:3000/webhooks/stigg', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const subscriptionCreated = {
  type: 'subscription.created',
  messageId: 'a6ce1f4e-0000-4000-8000-000000000001',
  traceId: '549a1f4e-0000-4000-8000-000000000002',
  entityId: 'customer-uuid',
  id: 'subscription-id',
  status: 'ACTIVE',
  customer: { id: 'customer-test-id', email: 'john@example.com' },
  plan: { id: 'plan-test-id', name: 'plan-test-name', pricingType: 'PAID' },
};

describe('verifyStiggSecret', () => {
  it('accepts a matching secret', () => {
    expect(verifyStiggSecret(SECRET, SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyStiggSecret('wrong', SECRET)).toBe(false);
  });

  it('rejects a secret of different length', () => {
    expect(verifyStiggSecret(SECRET + 'x', SECRET)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyStiggSecret(null, SECRET)).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifyStiggSecret(SECRET, undefined)).toBe(false);
  });
});

describe('POST /webhooks/stigg', () => {
  it('returns 401 when the header is missing', async () => {
    const res = await POST(makeRequest(subscriptionCreated));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong secret', async () => {
    const res = await POST(makeRequest(subscriptionCreated, 'wrong'));
    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid secret', async () => {
    const res = await POST(makeRequest(subscriptionCreated, SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const res = await POST(makeRequest(JSON.stringify(subscriptionCreated), SECRET, 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 500 when the secret is not configured (fails closed)', async () => {
    delete process.env.STIGG_WEBHOOK_SECRET;
    const res = await POST(makeRequest(subscriptionCreated, SECRET));
    expect(res.status).toBe(500);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(makeRequest('{not json', SECRET));
    expect(res.status).toBe(400);
  });

  it('returns 400 when type is missing', async () => {
    const res = await POST(makeRequest({ messageId: 'x' }, SECRET));
    expect(res.status).toBe(400);
  });

  it('handles known and unknown events', async () => {
    const types = [
      'customer.created', 'customer.updated', 'customer.deleted', 'customer.payment_failed',
      'subscription.created', 'subscription.updated', 'subscription.canceled',
      'subscription.expired', 'subscription.trial_started', 'subscription.trial_converted',
      'subscription.trial_expired', 'subscription.trial.ends_soon',
      'entitlements.updated', 'entitlement.usage_exceeded', 'some.future_event',
    ];
    for (const type of types) {
      const res = await POST(makeRequest({ ...subscriptionCreated, type }, SECRET));
      expect(res.status).toBe(200);
    }
  });
});
