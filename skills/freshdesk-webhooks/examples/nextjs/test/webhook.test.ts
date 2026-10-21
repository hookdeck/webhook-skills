import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  POST,
  EVENTS,
  verifyFreshdeskSecret,
  dedupeKey,
  dispatch,
} from '../app/webhooks/freshdesk/route';

// Freshdesk does not sign webhooks. The "secret" is a random value YOU put in the
// Trigger Webhook action's custom headers; tests send it the same way.
const SECRET = '3f9c0e7b5a1d4c2e8f6b0a9d7c5e3f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e';
const URL = 'http://localhost:3000/webhooks/freshdesk';

// Mirrors the Advanced JSON template from references/setup.md after Freshdesk
// has substituted the placeholders.
function ticketPayload(event: string, overrides: Record<string, string> = {}) {
  return {
    event,
    triggered_event: 'Ticket is created',
    ticket: {
      id: '1042',
      subject: 'Refund request',
      status: 'Open',
      priority: 'High',
      requester_email: 'amy@example.com',
      url: 'https://acme.freshdesk.com/helpdesk/tickets/1042',
      ...overrides,
    },
  };
}

function makeRequest(
  body: unknown,
  {
    header = 'X-Freshdesk-Webhook-Secret',
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
  process.env.FRESHDESK_WEBHOOK_SECRET = SECRET;
  delete process.env.FRESHDESK_WEBHOOK_HEADER;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyFreshdeskSecret', () => {
  it('accepts the matching secret', () => {
    expect(verifyFreshdeskSecret(SECRET)).toBe(true);
  });

  it('rejects a wrong secret of the same length', () => {
    expect(verifyFreshdeskSecret('0'.repeat(SECRET.length))).toBe(false);
  });

  it('rejects a length mismatch without throwing', () => {
    expect(verifyFreshdeskSecret(`${SECRET}0`)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyFreshdeskSecret(null)).toBe(false);
  });

  it('throws (fails closed) when FRESHDESK_WEBHOOK_SECRET is unset', () => {
    delete process.env.FRESHDESK_WEBHOOK_SECRET;
    expect(() => verifyFreshdeskSecret(SECRET)).toThrow(/FRESHDESK_WEBHOOK_SECRET/);
  });
});

describe('POST /webhooks/freshdesk', () => {
  it('accepts ticket_created with a valid secret', async () => {
    const res = await POST(makeRequest(ticketPayload(EVENTS.TICKET_CREATED)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts ticket_updated with a valid secret', async () => {
    const res = await POST(makeRequest(ticketPayload(EVENTS.TICKET_UPDATED, { status: 'Resolved' })));
    expect(res.status).toBe(200);
  });

  it('matches the header name case-insensitively', async () => {
    const res = await POST(
      makeRequest(ticketPayload(EVENTS.TICKET_CREATED), { header: 'x-freshdesk-webhook-secret' })
    );
    expect(res.status).toBe(200);
  });

  it('uses FRESHDESK_WEBHOOK_HEADER when set', async () => {
    process.env.FRESHDESK_WEBHOOK_HEADER = 'X-Acme-Token';
    const ok = await POST(makeRequest(ticketPayload(EVENTS.TICKET_CREATED), { header: 'X-Acme-Token' }));
    expect(ok.status).toBe(200);
    const wrongHeader = await POST(makeRequest(ticketPayload(EVENTS.TICKET_CREATED)));
    expect(wrongHeader.status).toBe(401);
  });

  it('rejects a missing secret header with 401', async () => {
    const res = await POST(makeRequest(ticketPayload(EVENTS.TICKET_CREATED), { secret: null }));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret with 401', async () => {
    const res = await POST(makeRequest(ticketPayload(EVENTS.TICKET_CREATED), { secret: 'not-the-secret' }));
    expect(res.status).toBe(401);
  });

  it('checks the secret before parsing the body', async () => {
    const res = await POST(makeRequest('{not json', { secret: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('fails closed with 500 when the secret is not configured', async () => {
    delete process.env.FRESHDESK_WEBHOOK_SECRET;
    const res = await POST(makeRequest(ticketPayload(EVENTS.TICKET_CREATED)));
    expect(res.status).toBe(500);
  });

  it('returns 400 for invalid JSON (e.g. XML encoding)', async () => {
    const res = await POST(
      makeRequest('<freshdesk_webhook><ticket_id>1</ticket_id></freshdesk_webhook>', {
        contentType: 'application/xml',
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when the payload has no event field', async () => {
    const res = await POST(makeRequest({ ticket: { id: '1042' } }));
    expect(res.status).toBe(400);
  });

  it('acknowledges an unknown event with 200', async () => {
    const res = await POST(makeRequest(ticketPayload('ticket_escalated')));
    expect(res.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('ticket_escalated'));
  });
});

describe('dispatch', () => {
  it('recognises both events', async () => {
    expect(await dispatch(ticketPayload(EVENTS.TICKET_CREATED))).toBe(true);
    expect(await dispatch(ticketPayload(EVENTS.TICKET_UPDATED))).toBe(true);
  });

  it('returns false for an unknown event', async () => {
    expect(await dispatch(ticketPayload('something_else'))).toBe(false);
  });
});

describe('dedupeKey', () => {
  it('combines event, ticket id and status', () => {
    expect(dedupeKey(ticketPayload(EVENTS.TICKET_UPDATED))).toBe('ticket_updated:1042:Open');
  });

  it('returns null without a ticket id', () => {
    expect(dedupeKey({ event: EVENTS.TICKET_CREATED })).toBeNull();
  });
});
