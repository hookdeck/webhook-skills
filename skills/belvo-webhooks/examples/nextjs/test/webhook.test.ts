import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/belvo/route';
import { classify, verifyBelvoRequest } from '../lib/verify-belvo';

const AUTH = 'Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516';

beforeAll(() => {
  process.env.BELVO_AUTHORIZATION = AUTH;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Shapes taken from Belvo's documented sample payloads (trimmed)
const paymentSuccess = {
  eventType: 'payment_request_update',
  eventCode: 'payment_request_successful',
  datetime: '2022-01-01T12:34:56.789Z',
  details: {
    id: '3118128a-6792-4b06-bd61-4acf6f6ad6b5',
    reference: 'your_reference_here',
    status: 'successful',
    amount: 100.5,
    failedReason: null,
    failedMessage: null,
  },
};
const paymentFailed = {
  eventType: 'payment_request_update',
  eventCode: 'payment_request_failed',
  datetime: '2022-01-01T12:34:56.789Z',
  details: { id: '3118128a-6792-4b06-bd61-4acf6f6ad6b5', status: 'failed', amount: 100.5, failedReason: 'insufficient_funds' },
};
const consentConfirmed = {
  eventType: 'consent_update',
  eventCode: 'consent_confirmed',
  datetime: '2025-10-30T12:34:56.789Z',
  details: { id: '4fa8f2b1-3c7d-4e9a-b5c6-111111111101', paymentMethodId: '4fa8f2b1-3c7d-4e9a-b5c6-111111111102', status: 'confirmed' },
};
const customerBlocked = {
  eventType: 'customer_update',
  eventCode: 'customer_blocked',
  datetime: '2025-10-30T12:34:56.789Z',
  details: { id: 'c1', documentNumber: 'XAXX010101000' },
};
const aggregation = {
  webhook_id: 'aadf41a1fc8e4f79a49f7f04027ac999',
  webhook_type: 'ACCOUNTS',
  webhook_code: 'new_accounts_available',
  link_id: '16f68516-bcbc-4cf7-b815-c500d4204e28',
  request_id: '4363b08b-51eb-4350-9c74-5df5ac92a7f6',
  external_id: 'your_external_id',
  data: {},
};
const brazilV1 = {
  webhook_id: '3b9a69f7-0f0a-455b-832d-49ad6fd4905c',
  webhook_type: 'PAYMENT_INTENTS',
  webhook_code: 'STATUS_UPDATE',
  object_id: 'd2e40773-19f6-48d1-93c3-3590ec0c74df',
  external_id: 'c3c51aaf-aaa3-400c-926d-87ab62e195fd',
  data: { status: 'FAILED', failure_code: 'consent_expired', failure_message: 'The payment consent was not accepted in time.' },
};
const brazilV2 = {
  schema_version: '2.0.0',
  resource: 'BANK_ACCOUNT',
  resource_id: '7d01c4cf-57ed-4ed9-b109-a5bfb2d8c42b',
  resource_version: 'V2',
  timestamp: '2025-01-16T10:30:45Z',
};
const aggregationError = {
  ...aggregation,
  webhook_type: 'TRANSACTIONS',
  webhook_code: 'historical_update',
  data: { errors: [{ code: 'operational_limits_reached', message: 'Operational Limit Reached' }] },
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(paymentSuccess),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/belvo', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Belvo webhook route', () => {
  it('accepts the full Authorization header value (Bearer)', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a Basic value when that is the configured credential', async () => {
    const basic = 'Basic ' + Buffer.from('belvo:s3cret').toString('base64');
    process.env.BELVO_AUTHORIZATION = basic;
    try {
      expect((await POST(makeRequest({ Authorization: basic }))).status).toBe(200);
      expect((await POST(makeRequest({ Authorization: AUTH }))).status).toBe(401);
    } finally {
      process.env.BELVO_AUTHORIZATION = AUTH;
    }
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const res = await POST(makeRequest({ Authorization: 'Bearer 00000000-0000-0000-0000-000000000000' }));
    expect(res.status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('rejects a different scheme with the same token', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH.replace('Bearer', 'Basic') }));
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(paymentFailed), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, '[1,2]'))).status).toBe(400);
  });

  it('accepts Payments (Mexico, Brazil V1/V2) and Aggregation payloads', async () => {
    for (const body of [paymentFailed, consentConfirmed, customerBlocked, aggregation, aggregationError, brazilV1, brazilV2]) {
      expect((await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(body)))).status).toBe(200);
    }
  });

  it('acknowledges unknown payloads', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, '{"foo":1}'))).status).toBe(200);
  });
});

describe('helpers', () => {
  it('classifies every payload shape', () => {
    expect(classify(paymentSuccess)).toEqual({ family: 'payments_mx', code: 'payment_request_successful' });
    expect(classify(brazilV1)).toEqual({ family: 'payments_br_v1', code: 'STATUS_UPDATE', type: 'PAYMENT_INTENTS' });
    expect(classify(brazilV2)).toEqual({ family: 'payments_br_v2', code: 'BANK_ACCOUNT', id: '7d01c4cf-57ed-4ed9-b109-a5bfb2d8c42b' });
    expect(classify(aggregation)).toEqual({ family: 'aggregation', code: 'new_accounts_available', type: 'ACCOUNTS' });
    expect(classify({ foo: 1 })).toBeNull();
  });

  it('never accepts when BELVO_AUTHORIZATION is unset', () => {
    expect(verifyBelvoRequest(new Headers({ Authorization: 'Bearer x' }), {})).toBe(false);
    expect(verifyBelvoRequest(new Headers({ Authorization: '' }), { BELVO_AUTHORIZATION: '' })).toBe(false);
  });
});
