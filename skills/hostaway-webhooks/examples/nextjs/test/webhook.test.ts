import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/hostaway/route';
import { getEventName, parseBasicAuth, verifyHostawayRequest } from '../lib/verify-hostaway';

const USERNAME = 'hostaway-hook';
const PASSWORD = 'p@ss:word/with+colon';

beforeAll(() => {
  process.env.HOSTAWAY_WEBHOOK_USERNAME = USERNAME;
  process.env.HOSTAWAY_WEBHOOK_PASSWORD = PASSWORD;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const basic = (user: string, pass: string) =>
  'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
const GOOD = basic(USERNAME, PASSWORD);

// Illustrative payload: Hostaway doesn't document the unified webhook body field by field.
const payload = (event = 'reservation.created') =>
  JSON.stringify({ event, data: { id: 1001, listingMapId: 2002, guestName: 'Jane Doe', status: 'new' } });

const EVENTS = ['reservation.created', 'reservation.updated', 'message.received', 'task.created', 'task.updated'];

const HANDLERS = { GET, POST, PUT, PATCH, DELETE };

function makeRequest(method: string, auth?: string, body?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = {};
  if (auth !== undefined) headers.authorization = auth;
  const hasBody = body !== undefined && method !== 'GET';
  if (hasBody) headers['content-type'] = contentType;
  return new NextRequest('http://localhost:3000/webhooks/hostaway', {
    method,
    headers,
    body: hasBody ? body : undefined,
  });
}

describe('Hostaway Basic auth', () => {
  it.each(Object.keys(HANDLERS))('accepts valid credentials on %s', async (method) => {
    const res = await HANDLERS[method as keyof typeof HANDLERS](makeRequest(method, GOOD, payload()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it.each(Object.keys(HANDLERS))('checks the credential first on %s', async (method) => {
    const res = await HANDLERS[method as keyof typeof HANDLERS](makeRequest(method, undefined, payload()));
    expect(res.status).toBe(401);
  });

  it('accepts a lowercase scheme', async () => {
    const res = await POST(makeRequest('POST', GOOD.replace('Basic', 'basic'), '{}'));
    expect(res.status).toBe(200);
  });

  it('accepts a non-ASCII password', () => {
    const headers = new Headers({ authorization: basic('üser', 'pässwörd:ü') });
    expect(verifyHostawayRequest(headers, 'üser', 'pässwörd:ü')).toBe(true);
  });

  it('rejects a wrong username', async () => {
    expect((await POST(makeRequest('POST', basic('nope', PASSWORD), '{}'))).status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    expect((await POST(makeRequest('POST', basic(USERNAME, 'nope'), '{}'))).status).toBe(401);
  });

  it('rejects a password that is only a prefix of the real one', async () => {
    expect((await POST(makeRequest('POST', basic(USERNAME, PASSWORD.slice(0, -1)), '{}'))).status).toBe(401);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest('POST', undefined, '{}'))).status).toBe(401);
  });

  it('rejects a non-Basic scheme', async () => {
    expect((await POST(makeRequest('POST', 'Bearer ' + GOOD.slice(6), '{}'))).status).toBe(401);
  });

  it('rejects credentials without a colon', async () => {
    const header = 'Basic ' + Buffer.from('no-colon-here').toString('base64');
    expect((await POST(makeRequest('POST', header, '{}'))).status).toBe(401);
  });

  it('rejects invalid base64', async () => {
    expect((await POST(makeRequest('POST', 'Basic !!!not-base64!!!', '{}'))).status).toBe(401);
  });

  it('rejects valid credentials followed by junk', async () => {
    expect((await POST(makeRequest('POST', GOOD + '@@@', '{}'))).status).toBe(401);
    expect((await POST(makeRequest('POST', GOOD + ' extra', '{}'))).status).toBe(401);
  });

  it('rejects everything when credentials are not configured', () => {
    expect(verifyHostawayRequest(new Headers({ authorization: basic('', '') }), '', '')).toBe(false);
    vi.stubEnv('HOSTAWAY_WEBHOOK_USERNAME', '');
    vi.stubEnv('HOSTAWAY_WEBHOOK_PASSWORD', '');
    expect(verifyHostawayRequest(new Headers({ authorization: GOOD }))).toBe(false);
  });

  it('parses the first colon only', () => {
    expect(parseBasicAuth(GOOD)).toEqual({ username: USERNAME, password: PASSWORD });
  });
});

describe('Hostaway events and bodies', () => {
  it.each(EVENTS)('handles %s', async (event) => {
    const res = await POST(makeRequest('POST', GOOD, payload(event)));
    expect(res.status).toBe(200);
  });

  it('reads eventType and object/action event names', () => {
    expect(getEventName({ eventType: 'task.updated' })).toBe('task.updated');
    expect(getEventName({ object: 'message', action: 'received' })).toBe('message.received');
    expect(getEventName({ foo: 'bar' })).toBeNull();
    expect(getEventName(null)).toBeNull();
  });

  it('accepts an empty body', async () => {
    const res = await POST(makeRequest('POST', GOOD));
    expect(res.status).toBe(200);
  });

  it('accepts and logs unknown shapes', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await POST(makeRequest('POST', GOOD, JSON.stringify({ something: 'else' })));
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('Unhandled event: null', ['something']);
  });

  it('accepts a non-JSON body of any content type', async () => {
    const res = await POST(
      makeRequest('POST', GOOD, 'event=reservation.created', 'application/x-www-form-urlencoded')
    );
    expect(res.status).toBe(200);
  });
});
