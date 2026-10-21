import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  POST,
  EVENTS,
  verifyUnipileSecret,
  dedupeKey,
  dispatch,
} from '../app/webhooks/unipile/route';

// Unipile does not sign webhooks. The "secret" is a random value YOU put in the
// webhook's `headers` array ({"key": "Unipile-Auth", "value": "<secret>"}).
const SECRET = '3f9c0e7b5a1d4c2e8f6b0a9d7c5e3f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e';
const URL = 'http://localhost:3000/webhooks/unipile';

function messagePayload(event: string = EVENTS.MESSAGE_RECEIVED) {
  return {
    account_id: 'dfXlh46vQYCsMbVarumWlg',
    account_type: 'LINKEDIN',
    account_info: { type: 'LINKEDIN', feature: 'classic', user_id: 'ACoAAAcDMMQBODyLwZrRcgYhrkCafURGqva0U4E' },
    event,
    chat_id: 'R8J-xM9WX7eoHLp6gSVtWQ',
    timestamp: '2023-09-24T13:49:07.965Z',
    webhook_name: 'Webhook demo',
    message_id: 'ykmhfXlRW0W_cqReJYrfBw',
    message: 'Hello World !',
    sender: { attendee_id: 'C8zaRZTlVcmfnke_Vai4Gg', attendee_name: 'Kim Unipile', attendee_provider_id: 'ACoAA-other' },
  };
}

function mailPayload(event: string = EVENTS.MAIL_RECEIVED) {
  return {
    email_id: '--R9___qXQKIu80oAF0lJA',
    account_id: 'GxwlUMaZTHefegva16XcWw',
    event,
    subject: 'Hello',
    from_attendee: { display_name: 'Julien', identifier: 'julien@example.com', identifier_type: 'EMAIL_ADDRESS' },
  };
}

function statusPayload(message = 'CREDENTIALS') {
  return { AccountStatus: { account_id: 'h_EKCy2lRLef5NzHp0iw4A', account_type: 'LINKEDIN', message } };
}

function makeRequest(
  body: unknown,
  {
    header = 'Unipile-Auth',
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
  process.env.UNIPILE_WEBHOOK_SECRET = SECRET;
  delete process.env.UNIPILE_WEBHOOK_HEADER;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyUnipileSecret', () => {
  it('accepts the matching secret', () => {
    expect(verifyUnipileSecret(SECRET)).toBe(true);
  });

  it('rejects a wrong secret of the same length', () => {
    expect(verifyUnipileSecret('0'.repeat(SECRET.length))).toBe(false);
  });

  it('rejects a length mismatch without throwing', () => {
    expect(verifyUnipileSecret(`${SECRET}0`)).toBe(false);
    expect(verifyUnipileSecret('short')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyUnipileSecret(null)).toBe(false);
  });

  it('throws (fails closed) when UNIPILE_WEBHOOK_SECRET is unset', () => {
    delete process.env.UNIPILE_WEBHOOK_SECRET;
    expect(() => verifyUnipileSecret(SECRET)).toThrow(/UNIPILE_WEBHOOK_SECRET/);
  });
});

describe('POST /webhooks/unipile', () => {
  it('accepts message_received with a valid secret', async () => {
    const res = await POST(makeRequest(messagePayload()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts message_read and mail_received', async () => {
    expect((await POST(makeRequest(messagePayload(EVENTS.MESSAGE_READ)))).status).toBe(200);
    expect((await POST(makeRequest(mailPayload()))).status).toBe(200);
  });

  it('accepts an AccountStatus payload (no event field)', async () => {
    expect((await POST(makeRequest(statusPayload('OK')))).status).toBe(200);
    expect((await POST(makeRequest(statusPayload('CREDENTIALS')))).status).toBe(200);
  });

  it('matches the header name case-insensitively', async () => {
    const res = await POST(makeRequest(messagePayload(), { header: 'unipile-auth' }));
    expect(res.status).toBe(200);
  });

  it('uses UNIPILE_WEBHOOK_HEADER when set', async () => {
    process.env.UNIPILE_WEBHOOK_HEADER = 'X-Acme-Token';
    expect((await POST(makeRequest(messagePayload(), { header: 'X-Acme-Token' }))).status).toBe(200);
    expect((await POST(makeRequest(messagePayload()))).status).toBe(401);
  });

  it('rejects a missing secret header with 401', async () => {
    expect((await POST(makeRequest(messagePayload(), { secret: null }))).status).toBe(401);
  });

  it('rejects a wrong secret with 401', async () => {
    expect((await POST(makeRequest(messagePayload(), { secret: 'nope' }))).status).toBe(401);
  });

  it('checks the secret before parsing the body', async () => {
    expect((await POST(makeRequest('{not json', { secret: 'wrong' }))).status).toBe(401);
  });

  it('fails closed with 500 when the secret is not configured', async () => {
    delete process.env.UNIPILE_WEBHOOK_SECRET;
    expect((await POST(makeRequest(messagePayload()))).status).toBe(500);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest('not json'))).status).toBe(400);
  });

  it('returns 400 when the payload has no event and no AccountStatus', async () => {
    expect((await POST(makeRequest({ account_id: 'x' }))).status).toBe(400);
  });

  it('acknowledges an unknown event with 200', async () => {
    const res = await POST(makeRequest(messagePayload('message_something_new')));
    expect(res.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('message_something_new'));
  });

  it('accepts a body sent without a JSON content type', async () => {
    const res = await POST(makeRequest(messagePayload(), { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });
});

describe('dispatch', () => {
  it('recognises the documented events', async () => {
    expect(await dispatch(messagePayload())).toBe(true);
    expect(await dispatch(mailPayload())).toBe(true);
    expect(await dispatch(statusPayload())).toBe(true);
  });

  it('returns false for an unknown event', async () => {
    expect(await dispatch({ event: 'something_else' })).toBe(false);
  });
});

describe('dedupeKey', () => {
  it('keys messages, emails, tracking events and account status', () => {
    expect(dedupeKey(messagePayload())).toBe('message_received:ykmhfXlRW0W_cqReJYrfBw');
    expect(dedupeKey(mailPayload())).toBe('mail_received:--R9___qXQKIu80oAF0lJA');
    expect(dedupeKey({ event: 'mail_opened', event_id: 's-5DTo49QZ' })).toBe('mail_opened:s-5DTo49QZ');
    expect(dedupeKey(statusPayload('OK'))).toBe('account_status:h_EKCy2lRLef5NzHp0iw4A:OK');
  });

  it('returns null when no identifier is present', () => {
    expect(dedupeKey({ event: 'new_relation' })).toBeNull();
  });
});
