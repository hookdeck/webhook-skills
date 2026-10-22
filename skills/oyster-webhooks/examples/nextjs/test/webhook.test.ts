import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/oyster/route';
import { verifyOysterRequest } from '../lib/verify-oyster';

const AUTH = 'Bearer s3cr3t-shared-secret-12345';

beforeAll(() => {
  process.env.OYSTER_AUTHORIZATION = AUTH;
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Envelope and data keys follow Oyster's documented webhook events
function makeEvent(eventName: string, data: Record<string, unknown>) {
  return {
    eventName,
    eventTimestamp: '2026-04-21T09:35:13Z',
    id: 'wh_01J19XRFZ2Q4QBDC6CA461AGT7',
    companyId: 'ABC1234',
    data,
  };
}

const events: Record<string, ReturnType<typeof makeEvent>> = {
  engaged: makeEvent('hiring.employment_engaged', { engagementId: 'eng_1' }),
  approved: makeEvent('expenses.expense_approved', {
    expenseId: 'exp_1',
    reviewState: 'approved',
    previousReviewState: 'pending',
  }),
  applied: makeEvent('contract.change_applied', {
    engagementChangeId: 'chg_1',
    changeType: 'salary',
    state: 'applied',
  }),
  enrolled: makeEvent('benefits.enrollment_enrolled', { engagementId: 'eng_1', enrollmentId: 'enr_1' }),
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(events.engaged),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/oyster', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Oyster webhook', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const res = await POST(makeRequest({ Authorization: 'Bearer wrong-secret' }));
    expect(res.status).toBe(401);
  });

  it('rejects the secret without the "Bearer " prefix', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('rejects a header of a different length without throwing', async () => {
    const res = await POST(makeRequest({ Authorization: 'Bearer x' }));
    expect(res.status).toBe(401);
  });

  it('rejects everything when OYSTER_AUTHORIZATION is unset', () => {
    const headers = new Headers({ authorization: AUTH });
    expect(verifyOysterRequest(headers, {})).toBe(false);
    expect(verifyOysterRequest(new Headers({ authorization: '' }), { OYSTER_AUTHORIZATION: '' })).toBe(false);
  });

  it('authenticates before parsing, so a bad credential with bad JSON is 401', async () => {
    const res = await POST(makeRequest({ Authorization: 'Bearer nope' }, 'not json'));
    expect(res.status).toBe(401);
  });

  it.each(Object.entries(events))('handles %s', async (_name, event) => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(event)));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalled();
  });

  it('logs details for expenses.expense_approved', async () => {
    await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(events.approved)));
    expect(console.log).toHaveBeenCalledWith('Expense exp_1 approved (pending -> approved)');
  });

  it('returns 200 for events it does not handle', async () => {
    const body = JSON.stringify(makeEvent('time_off.request_created', {}));
    const res = await POST(makeRequest({ Authorization: AUTH }, body));
    expect(res.status).toBe(200);
  });

  it('accepts any content type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(events.applied), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, 'not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when eventName is missing', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify({ id: 'wh_1', data: {} })));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, '[]'));
    expect(res.status).toBe(400);
  });
});
