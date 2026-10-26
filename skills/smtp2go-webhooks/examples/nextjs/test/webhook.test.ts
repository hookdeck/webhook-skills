import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/smtp2go/route';
import { parseBody, verifySmtp2goRequest } from '../lib/verify-smtp2go';

const AUTH = 'Bearer 1b2c3d4e5f6047189a0bc1d2e3f40516';

let log: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  process.env.SMTP2GO_AUTHORIZATION = AUTH;
});

beforeEach(() => {
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});

const delivered = {
  event: 'delivered',
  time: '2026-10-26T10:00:00Z',
  sender: 'sender@example.com',
  rcpt: 'user@example.com',
  email_id: '1abcDE-ABC123-xy',
  id: 'wh-1',
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(delivered),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/smtp2go', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('SMTP2GO webhook route', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    expect((await POST(makeRequest({ Authorization: 'Bearer nope' }))).status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('checks the credential before parsing the body', async () => {
    expect((await POST(makeRequest({}, 'not json'))).status).toBe(401);
  });

  it('handles a JSON bounce event', async () => {
    const body = JSON.stringify({ ...delivered, event: 'bounce', bounce: 'hard', message: '550 no such user' });
    const res = await POST(makeRequest({ Authorization: AUTH }, body));
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Bounce (hard) for user@example.com'));
  });

  it('handles a form-encoded event', async () => {
    const body = new URLSearchParams({ event: 'open', rcpt: 'user@example.com', email_id: 'e1' }).toString();
    const res = await POST(makeRequest({ Authorization: AUTH }, body, 'application/x-www-form-urlencoded'));
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Opened e1 by user@example.com'));
  });

  it('handles an SMS event', async () => {
    const body = JSON.stringify({ event: 'sms_failed', destination_number: '+15555550100', message_id: 'sms-1', status_code: '500' });
    const res = await POST(makeRequest({ Authorization: AUTH }, body));
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('SMS sms-1 to +15555550100 failed (500)'));
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, '[1,2]'))).status).toBe(400);
  });
});

describe('verifySmtp2goRequest', () => {
  it('compares the whole value, including a Basic prefix', () => {
    const basic = 'Basic dXNlcjpwYXNz';
    const config = { SMTP2GO_AUTHORIZATION: basic };
    expect(verifySmtp2goRequest(new Headers({ Authorization: basic }), config)).toBe(true);
    expect(verifySmtp2goRequest(new Headers({ Authorization: 'dXNlcjpwYXNz' }), config)).toBe(false);
  });

  it('rejects everything when no credential is configured', () => {
    expect(verifySmtp2goRequest(new Headers({ Authorization: 'x' }), {})).toBe(false);
  });
});

describe('parseBody', () => {
  it('decodes both output types', () => {
    expect(parseBody('{"event":"click"}', 'application/json')).toEqual({ event: 'click' });
    expect(parseBody('event=click&rcpt=a%40b.com', 'application/x-www-form-urlencoded')).toEqual({
      event: 'click',
      rcpt: 'a@b.com',
    });
  });
});
