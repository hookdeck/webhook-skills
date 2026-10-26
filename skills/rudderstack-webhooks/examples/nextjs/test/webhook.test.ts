import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, GET, DELETE } from '../app/webhooks/rudderstack/route';
import { parseBasicAuth, verifyRudderstackRequest } from '../lib/verify-rudderstack';

const USERNAME = 'rudder-user';
const PASSWORD = 'p@ss:word/with:colons';

beforeAll(() => {
  process.env.RUDDERSTACK_WEBHOOK_USERNAME = USERNAME;
  process.env.RUDDERSTACK_WEBHOOK_PASSWORD = PASSWORD;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

const basic = (user: string, pass: string, scheme = 'Basic') =>
  `${scheme} ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
const good = basic(USERNAME, PASSWORD);

const track = { type: 'track', event: 'Order Completed', userId: 'u1', properties: { total: 10 } };
const identify = { type: 'identify', userId: 'u1', traits: { email: 'a@example.com' } };

function req(method: string, authorization?: string, body?: string, contentType = 'application/json') {
  const headers: Record<string, string> = {};
  if (authorization) headers['authorization'] = authorization;
  if (body !== undefined) headers['content-type'] = contentType;
  return new NextRequest('http://localhost/webhooks/rudderstack', { method, headers, body });
}

describe('RudderStack webhook (Basic auth)', () => {
  it('accepts a track event with correct credentials', async () => {
    const res = await POST(req('POST', good, JSON.stringify(track)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, events: 1 });
  });

  it('accepts an identify event', async () => {
    const res = await POST(req('POST', good, JSON.stringify(identify)));
    expect(res.status).toBe(200);
  });

  it('accepts a lowercase scheme and a non-JSON content type', async () => {
    const res = await POST(
      req('POST', basic(USERNAME, PASSWORD, 'basic'), JSON.stringify(track), 'text/plain')
    );
    expect(res.status).toBe(200);
  });

  it('accepts a batched array of events', async () => {
    const res = await POST(req('POST', good, JSON.stringify([track, identify])));
    expect(res.status).toBe(200);
    expect((await res.json()).events).toBe(2);
  });

  it('accepts PUT, PATCH and DELETE', async () => {
    for (const [method, handler] of [['PUT', PUT], ['PATCH', PATCH], ['DELETE', DELETE]] as const) {
      const res = await handler(req(method, good, JSON.stringify(track)));
      expect(res.status).toBe(200);
    }
  });

  it('accepts GET with an empty body', async () => {
    const res = await GET(req('GET', good));
    expect(res.status).toBe(200);
    expect((await res.json()).events).toBe(0);
  });

  it('rejects a missing Authorization header', async () => {
    const res = await POST(req('POST', undefined, JSON.stringify(track)));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong password, wrong username and swapped values', async () => {
    for (const value of [
      basic(USERNAME, 'nope'),
      basic('other', PASSWORD),
      basic(PASSWORD, USERNAME),
    ]) {
      const res = await POST(req('POST', value, JSON.stringify(track)));
      expect(res.status).toBe(401);
    }
  });

  it('rejects a Bearer scheme and malformed values', async () => {
    for (const value of [
      `Bearer ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}`,
      'Basic',
      'Basic !!!not-base64!!!',
      `Basic ${Buffer.from('no-colon-here').toString('base64')}`,
    ]) {
      const res = await POST(req('POST', value, JSON.stringify(track)));
      expect(res.status).toBe(401);
    }
  });

  it('rejects GET without credentials', async () => {
    const res = await GET(req('GET'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON after authenticating', async () => {
    const res = await POST(req('POST', good, '{not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON scalar', async () => {
    const res = await POST(req('POST', good, '42'));
    expect(res.status).toBe(400);
  });
});

describe('verifyRudderstackRequest', () => {
  it('fails closed when unconfigured', () => {
    const headers = new Headers({ authorization: good });
    expect(verifyRudderstackRequest(headers, {})).toBe(false);
    expect(verifyRudderstackRequest(headers, { RUDDERSTACK_WEBHOOK_USERNAME: USERNAME })).toBe(false);
  });

  it('handles non-ASCII credentials', () => {
    const config = { RUDDERSTACK_WEBHOOK_USERNAME: 'üser', RUDDERSTACK_WEBHOOK_PASSWORD: 'pässwörd' };
    expect(
      verifyRudderstackRequest(new Headers({ authorization: basic('üser', 'pässwörd') }), config)
    ).toBe(true);
    expect(
      verifyRudderstackRequest(new Headers({ authorization: basic('user', 'pässwörd') }), config)
    ).toBe(false);
  });

  it('splits on the first colon', () => {
    expect(parseBasicAuth(basic('a', 'b:c:d'))).toEqual({ username: 'a', password: 'b:c:d' });
  });
});
