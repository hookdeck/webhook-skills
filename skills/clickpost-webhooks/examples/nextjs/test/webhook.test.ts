import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

const SECRET = 'cp_test_simple_token_123';

let POST: (req: NextRequest) => Promise<Response>;
let verifyClickPostRequest: (h: Headers, s?: string) => boolean;

beforeAll(async () => {
  process.env.CLICKPOST_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/clickpost/route'));
  ({ verifyClickPostRequest } = await import('../lib/verify-clickpost'));
});

// Shape follows ClickPost's documented sample payloads.
function scan(code: number, description: string, status: string, overrides: Record<string, unknown> = {}) {
  return {
    waybill: 'TEST-AWB-HLD-123',
    cp_id: 10001,
    status,
    remark: status,
    location: 'Pushpak_Nagar',
    timestamp: '2024-11-19T10:04:20Z',
    clickpost_status_code: code,
    clickpost_status_description: description,
    additional: {
      notification_event_id: 92,
      latest_status: { clickpost_status_code: code, clickpost_status_description: description },
      is_rvp: false,
      order_id: 'TESTORDERHLD123',
    },
    ...overrides,
  };
}

function post(body: unknown, auth: string | null = `Token ${SECRET}`, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (auth !== null) headers.authorization = auth;
  return POST(
    new NextRequest('http://localhost/webhooks/clickpost', {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

describe('ClickPost webhook', () => {
  it('accepts Authorization: Token <secret>', async () => {
    const res = await post(scan(8, 'Delivered', 'Delivered', { waybill: 'W-OK-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('matches the Token scheme case-insensitively', async () => {
    const res = await post(scan(6, 'OutForDelivery', 'Out for Delivery', { waybill: 'W-CASE' }), `tOkEn ${SECRET}`);
    expect(res.status).toBe(200);
  });

  it('accepts any content type', async () => {
    const res = await post(scan(4, 'PickedUp', 'Picked Up', { waybill: 'W-CT' }), `Token ${SECRET}`, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(scan(8, 'Delivered', 'Delivered'), null)).status).toBe(401);
  });

  it('rejects the Bearer scheme', async () => {
    expect((await post(scan(8, 'Delivered', 'Delivered'), `Bearer ${SECRET}`)).status).toBe(401);
  });

  it('rejects the bare secret without a scheme', async () => {
    expect((await post(scan(8, 'Delivered', 'Delivered'), SECRET)).status).toBe(401);
  });

  it('rejects a wrong token, including one of a different length', async () => {
    expect((await post(scan(8, 'Delivered', 'Delivered'), 'Token wrong')).status).toBe(401);
    expect((await post(scan(8, 'Delivered', 'Delivered'), `Token ${SECRET}x`)).status).toBe(401);
  });

  it('does not trim the secret', async () => {
    expect((await post(scan(8, 'Delivered', 'Delivered'), `Token  ${SECRET}`)).status).toBe(401);
  });

  it('returns 400 for invalid JSON after authenticating', async () => {
    expect((await post('not json')).status).toBe(400);
  });

  it('returns 400 when clickpost_status_code is missing', async () => {
    expect((await post({ waybill: 'x' })).status).toBe(400);
  });

  it('handles an unknown status code', async () => {
    expect((await post(scan(99, 'Mystery', 'Mystery', { waybill: 'W-UNK' }))).status).toBe(200);
  });

  it('dedupes on waybill + scan', async () => {
    const body = scan(5, 'InTransit', 'In Transit', { waybill: 'W-DUP' });
    expect(await (await post(body)).json()).toEqual({ received: true });
    expect(await (await post(body)).json()).toEqual({ received: true, duplicate: true });
  });

  it('handles a rider allocation scan', async () => {
    expect((await post(scan(41, 'RiderAllocationFailed', 'ALLOCATION FAILED', { waybill: 'W-41' }))).status).toBe(200);
  });
});

describe('verifyClickPostRequest', () => {
  it('strips a leading "Token " from the configured secret, case-insensitively', () => {
    expect(verifyClickPostRequest(new Headers({ authorization: 'Token abc' }), 'token abc')).toBe(true);
    expect(verifyClickPostRequest(new Headers({ authorization: 'Token abc' }), 'abc')).toBe(true);
  });

  it('fails closed when no secret is configured', () => {
    expect(verifyClickPostRequest(new Headers({ authorization: 'Token ' }), '')).toBe(false);
  });
});
