import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const PRIVATE_KEY = 'test_tremendous_private_key';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.TREMENDOUS_WEBHOOK_PRIVATE_KEY = PRIVATE_KEY;
  ({ POST } = await import('../app/webhooks/tremendous/route'));
});

function sign(body: string, key = PRIVATE_KEY): string {
  return 'sha256=' + crypto.createHmac('sha256', key).update(body).digest('hex');
}

const payload = (event: string) =>
  JSON.stringify({
    event,
    uuid: '5ccc7bb1-7659-4e23-a407-77d8cd9c62f5',
    created_utc: '2021-04-06T20:05:01.037-04:00',
    payload: { resource: { id: '2V3PCCL7QXDA', type: 'rewards' }, meta: {} },
  });

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/tremendous', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('Tremendous webhook route', () => {
  const events = [
    'REWARDS.DELIVERY.SUCCEEDED', 'REWARDS.DELIVERY.FAILED', 'REWARDS.CANCELED', 'REWARDS.FLAGGED',
    'ORDERS.CREATED', 'ORDERS.APPROVED', 'ORDERS.CANCELED', 'ORDERS.FAILED',
    'CAMPAIGNS.CREATED', 'FUNDING_SOURCES.FUNDED', 'INVOICES.PAID',
  ];

  it.each(events)('accepts a signed %s event', async (event) => {
    const body = payload(event);
    const res = await POST(makeRequest(body, { 'tremendous-webhook-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = payload('ORDERS.CREATED');
    const res = await POST(
      makeRequest(body, { 'content-type': 'text/plain', 'tremendous-webhook-signature': sign(body) })
    );
    expect(res.status).toBe(200);
  });

  it('acknowledges events without a dedicated case', async () => {
    const body = payload('PRODUCTS.UPDATED');
    const res = await POST(makeRequest(body, { 'tremendous-webhook-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = payload('ORDERS.APPROVED');
    const res = await POST(makeRequest(body, { 'tremendous-webhook-signature': sign(body, 'wrong') }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered body', async () => {
    const res = await POST(
      makeRequest(payload('ORDERS.FAILED'), { 'tremendous-webhook-signature': sign(payload('ORDERS.APPROVED')) })
    );
    expect(res.status).toBe(400);
  });

  it.each([
    ['missing prefix', (s: string) => s.slice('sha256='.length)],
    ['wrong algorithm', (s: string) => s.replace('sha256', 'sha1')],
    ['non-hex', () => 'sha256=' + 'zz'.repeat(32)],
    ['short', (s: string) => s.slice(0, -2)],
    ['empty digest', () => 'sha256='],
  ])('returns 400 for a %s signature', async (_name, mutate) => {
    const body = payload('ORDERS.APPROVED');
    const res = await POST(makeRequest(body, { 'tremendous-webhook-signature': mutate(sign(body)) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(payload('ORDERS.APPROVED')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for signed but invalid JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'tremendous-webhook-signature': sign(body) }));
    expect(res.status).toBe(400);
  });
});
