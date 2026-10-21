import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, DELETE } from '../app/webhooks/gorgias/route';
import { verifyGorgiasAuthorization, parseGorgiasBody, eventName } from '../lib/gorgias';

// A random shared secret, the kind `openssl rand -hex 32` produces.
const TEST_SECRET = '5f2b8c1e9a7d4e3f6b0c8a2d1e9f7b3c5a4d6e8f0b1c3a5d7e9f2b4c6a8d0e1f';
const AUTH = `Bearer ${TEST_SECRET}`;
const URL_BASE = 'http://localhost:3000/webhooks/gorgias';

// What Gorgias sends for the recommended body template (variables rendered as strings).
function samplePayload(event = 'ticket-created') {
  return {
    event,
    ticket_id: '48213',
    subject: 'Where is my order?',
    status: 'open',
    channel: 'email',
    customer_email: 'jane@example.com',
    assignee_email: '',
    updated_datetime: '2026-10-21T09:14:02.118000+00:00',
    message_text: "Hi, my order #1042 hasn't arrived yet.",
  };
}

function makeRequest(
  body: string | undefined,
  {
    method = 'POST',
    auth = AUTH as string | null,
    contentType = 'application/json',
    url = URL_BASE,
  } = {}
) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = contentType;
  if (auth !== null) headers['authorization'] = auth;
  return new NextRequest(url, { method, headers, body });
}

beforeEach(() => {
  process.env.GORGIAS_WEBHOOK_SECRET = TEST_SECRET;
});

describe('verifyGorgiasAuthorization', () => {
  it('accepts the exact configured header value', () => {
    expect(verifyGorgiasAuthorization(AUTH, TEST_SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyGorgiasAuthorization('Bearer wrong', TEST_SECRET)).toBe(false);
  });

  it('rejects the bare secret without the Bearer scheme', () => {
    expect(verifyGorgiasAuthorization(TEST_SECRET, TEST_SECRET)).toBe(false);
  });

  it('rejects a different-length value without throwing', () => {
    expect(verifyGorgiasAuthorization(`${AUTH}x`, TEST_SECRET)).toBe(false);
  });

  it('fails closed when header or secret is missing', () => {
    expect(verifyGorgiasAuthorization(null, TEST_SECRET)).toBe(false);
    expect(verifyGorgiasAuthorization(AUTH, '')).toBe(false);
  });
});

describe('parseGorgiasBody / eventName', () => {
  it('parses JSON bodies', () => {
    expect(parseGorgiasBody(JSON.stringify(samplePayload()), 'application/json').ticket_id).toBe('48213');
  });

  it('parses form-urlencoded bodies', () => {
    expect(
      parseGorgiasBody('event=ticket-updated&ticket_id=7&status=closed', 'application/x-www-form-urlencoded')
    ).toEqual({ event: 'ticket-updated', ticket_id: '7', status: 'closed' });
  });

  it('treats an empty body as {}', () => {
    expect(parseGorgiasBody('', null)).toEqual({});
  });

  it('prefers the body event, then the query string', () => {
    const qs = new URLSearchParams('event=ticket-updated');
    expect(eventName({ event: 'ticket-created' }, qs)).toBe('ticket-created');
    expect(eventName({}, qs)).toBe('ticket-updated');
    expect(eventName({}, new URLSearchParams())).toBe('unknown');
  });
});

describe('POST /webhooks/gorgias', () => {
  it('returns 200 for a valid Authorization header', async () => {
    const res = await POST(makeRequest(JSON.stringify(samplePayload())));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const res = await POST(makeRequest(JSON.stringify(samplePayload()), { auth: null }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Missing Authorization header');
  });

  it('returns 401 for a wrong secret', async () => {
    const res = await POST(makeRequest(JSON.stringify(samplePayload()), { auth: 'Bearer not-the-secret' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Invalid Authorization header');
  });

  it('returns 400 for invalid JSON after authenticating', async () => {
    const res = await POST(makeRequest('{"event": "ticket-created", "subject": "say "hi""}'));
    expect(res.status).toBe(400);
  });

  it('accepts form-urlencoded bodies', async () => {
    const res = await POST(
      makeRequest('event=ticket-message-created&ticket_id=48213', {
        contentType: 'application/x-www-form-urlencoded',
      })
    );
    expect(res.status).toBe(200);
  });

  it('returns 500 when GORGIAS_WEBHOOK_SECRET is not set', async () => {
    delete process.env.GORGIAS_WEBHOOK_SECRET;
    const res = await POST(makeRequest(JSON.stringify(samplePayload())));
    expect(res.status).toBe(500);
  });

  it.each([
    'ticket-created',
    'ticket-updated',
    'ticket-message-created',
    'ticket-self-unsnoozed',
    'ticket-message-failed',
    'ticket-assignment-updated',
    'ticket-status-updated',
    'ticket-handed-over',
    'some-future-trigger',
  ])('handles %s', async (event) => {
    const res = await POST(makeRequest(JSON.stringify(samplePayload(event))));
    expect(res.status).toBe(200);
  });
});

describe('other methods Gorgias can use', () => {
  it.each([
    ['PUT', PUT],
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ] as const)('accepts %s', async (method, handler) => {
    const res = await handler(makeRequest(JSON.stringify(samplePayload('ticket-updated')), { method }));
    expect(res.status).toBe(200);
  });

  it('accepts a DELETE with no body and the event in the query string', async () => {
    const res = await DELETE(
      makeRequest(undefined, { method: 'DELETE', url: `${URL_BASE}?event=ticket-status-updated` })
    );
    expect(res.status).toBe(200);
  });

  it('still requires authentication on PUT', async () => {
    const res = await PUT(makeRequest(JSON.stringify(samplePayload()), { method: 'PUT', auth: null }));
    expect(res.status).toBe(401);
  });
});
