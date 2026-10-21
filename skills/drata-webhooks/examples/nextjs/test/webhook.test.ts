import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  POST,
  EVENTS,
  verifyDrataSecret,
  dedupeKey,
  dispatch,
} from '../app/webhooks/drata/route';

// Drata does not publish a signing secret for workflow webhooks. The "secret" is a
// random value YOU put in the Send webhook step's custom headers; tests send it the same way.
const SECRET = '3f9c0e7b5a1d4c2e8f6b0a9d7c5e3f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e';
const URL = 'http://localhost:3000/webhooks/drata';

// Flat body as described in Drata's help center.
function controlPayload(eventType: string, overrides: Record<string, unknown> = {}) {
  return {
    event_type: eventType,
    timestamp: '2026-10-21T09:30:00.000Z',
    organization_id: 'org_123',
    workspace: { id: 1, name: 'Main' },
    control_id: 42,
    control_code: 'DCF-101',
    control_name: 'Access reviews performed quarterly',
    control_owners: [{ name: 'Amy Doe', email: 'amy@example.com' }],
    evidence_name: 'Q3 access review',
    test_name: 'MFA enabled',
    updated_by: 'Amy Doe',
    ...overrides,
  };
}

function makeRequest(
  body: unknown,
  {
    header = 'X-Webhook-Secret',
    secret = SECRET as string | null,
    contentType = 'application/json',
  } = {}
): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (secret !== null) headers[header] = secret;
  return new NextRequest(URL, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.DRATA_WEBHOOK_SECRET = SECRET;
  delete process.env.DRATA_WEBHOOK_HEADER;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyDrataSecret', () => {
  it('accepts the matching secret', () => {
    expect(verifyDrataSecret(SECRET)).toBe(true);
  });

  it('rejects a wrong secret of the same length', () => {
    expect(verifyDrataSecret('0'.repeat(SECRET.length))).toBe(false);
  });

  it('rejects a length mismatch without throwing', () => {
    expect(verifyDrataSecret(`${SECRET}0`)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyDrataSecret(null)).toBe(false);
  });

  it('throws (fails closed) when DRATA_WEBHOOK_SECRET is unset', () => {
    delete process.env.DRATA_WEBHOOK_SECRET;
    expect(() => verifyDrataSecret(SECRET)).toThrow(/DRATA_WEBHOOK_SECRET/);
  });
});

describe('POST /webhooks/drata', () => {
  it.each(Object.values(EVENTS))('accepts %s with a valid secret', async (eventType) => {
    const res = await POST(makeRequest(controlPayload(eventType)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('matches the header name case-insensitively', async () => {
    const res = await POST(
      makeRequest(controlPayload(EVENTS.CONTROL_EVIDENCE_LINKED), { header: 'x-webhook-secret' })
    );
    expect(res.status).toBe(200);
  });

  it('uses DRATA_WEBHOOK_HEADER when set', async () => {
    process.env.DRATA_WEBHOOK_HEADER = 'X-Acme-Token';
    const ok = await POST(
      makeRequest(controlPayload(EVENTS.CONTROL_EVIDENCE_LINKED), { header: 'X-Acme-Token' })
    );
    expect(ok.status).toBe(200);
    const wrongHeader = await POST(makeRequest(controlPayload(EVENTS.CONTROL_EVIDENCE_LINKED)));
    expect(wrongHeader.status).toBe(401);
  });

  it('rejects a missing secret header with 401', async () => {
    const res = await POST(makeRequest(controlPayload(EVENTS.CONTROL_EVIDENCE_LINKED), { secret: null }));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret with 401', async () => {
    const res = await POST(
      makeRequest(controlPayload(EVENTS.CONTROL_EVIDENCE_LINKED), { secret: 'not-the-secret' })
    );
    expect(res.status).toBe(401);
  });

  it('checks the secret before parsing the body', async () => {
    const res = await POST(makeRequest('{not json', { secret: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('fails closed with 500 when the secret is not configured', async () => {
    delete process.env.DRATA_WEBHOOK_SECRET;
    const res = await POST(makeRequest(controlPayload(EVENTS.CONTROL_EVIDENCE_LINKED)));
    expect(res.status).toBe(500);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(makeRequest('{not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the payload has no event_type', async () => {
    const res = await POST(makeRequest({ control_id: 42 }));
    expect(res.status).toBe(400);
  });

  it('acknowledges an unknown event_type with 200', async () => {
    const res = await POST(makeRequest(controlPayload('RISK_TREATMENT_CHANGED')));
    expect(res.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('RISK_TREATMENT_CHANGED'));
  });

  it('accepts a body sent without a JSON content type', async () => {
    const res = await POST(
      makeRequest(controlPayload(EVENTS.CONTROL_OWNER_UPDATED), { contentType: 'text/plain' })
    );
    expect(res.status).toBe(200);
  });
});

describe('dispatch', () => {
  it('recognises every control event', async () => {
    for (const eventType of Object.values(EVENTS)) {
      expect(await dispatch(controlPayload(eventType))).toBe(true);
    }
  });

  it('returns false for an unknown event', async () => {
    expect(await dispatch(controlPayload('SOMETHING_ELSE'))).toBe(false);
  });
});

describe('dedupeKey', () => {
  it('combines event_type, control_id and timestamp', () => {
    expect(dedupeKey(controlPayload(EVENTS.CONTROL_EVIDENCE_LINKED))).toBe(
      'CONTROL_EVIDENCE_LINKED:42:2026-10-21T09:30:00.000Z'
    );
  });

  it('returns null without a control_id', () => {
    expect(dedupeKey({ event_type: EVENTS.CONTROL_EVIDENCE_LINKED })).toBeNull();
  });
});
