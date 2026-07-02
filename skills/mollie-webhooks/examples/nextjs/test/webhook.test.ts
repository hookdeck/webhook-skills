import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mollie webhooks are unsigned: the POST body is form-urlencoded and carries only
// an `id`. We mock @mollie/api-client so the route fetches through a stub instead
// of calling the real API, then assert it dispatches on the AUTHORITATIVE status.

const paymentsGet = vi.fn();

vi.mock('@mollie/api-client', () => ({
  createMollieClient: () => ({ payments: { get: paymentsGet } }),
}));

process.env.MOLLIE_API_KEY = 'test_dummy';

// Import after the mock + env are set up.
const routeModulePromise = import('../app/webhooks/mollie/route');

function makeRequest(fields: Record<string, string>): Request {
  const body = new URLSearchParams(fields).toString();
  return new Request('http://localhost/webhooks/mollie', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
}

describe('Mollie webhook route', () => {
  beforeEach(() => {
    paymentsGet.mockReset();
  });

  it('returns 400 when the id is missing', async () => {
    const { POST } = await routeModulePromise;
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(400);
    expect(paymentsGet).not.toHaveBeenCalled();
  });

  it('fetches by the id from the body and ignores any body status', async () => {
    const { POST } = await routeModulePromise;
    paymentsGet.mockResolvedValue({ id: 'tr_abc123', status: 'paid' });

    const res = await POST(makeRequest({ id: 'tr_abc123', status: 'ignored' }) as never);

    expect(res.status).toBe(200);
    expect(paymentsGet).toHaveBeenCalledWith('tr_abc123');
  });

  it('returns 200 for an unknown/deleted id (API 404)', async () => {
    const { POST } = await routeModulePromise;
    paymentsGet.mockRejectedValue({ statusCode: 404 });

    const res = await POST(makeRequest({ id: 'tr_unknown' }) as never);
    expect(res.status).toBe(200);
  });

  it('returns 500 when the Mollie API fetch fails (so Mollie retries)', async () => {
    const { POST } = await routeModulePromise;
    paymentsGet.mockRejectedValue(new Error('network down'));

    const res = await POST(makeRequest({ id: 'tr_transient' }) as never);
    expect(res.status).toBe(500);
  });

  it.each([
    'open',
    'pending',
    'authorized',
    'paid',
    'canceled',
    'expired',
    'failed',
    'some_future_status',
  ])('returns 200 and handles status %s', async (status) => {
    const { POST } = await routeModulePromise;
    paymentsGet.mockResolvedValue({ id: `tr_${status}`, status });

    const res = await POST(makeRequest({ id: `tr_${status}` }) as never);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
  });
});
