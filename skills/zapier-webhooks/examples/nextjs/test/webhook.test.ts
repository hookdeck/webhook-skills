// Generated with: zapier-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  POST,
  PUT,
  PATCH,
  verifyZapierRequest,
  verifyBasicAuth,
  parseBody,
} from '../app/webhooks/zapier/route';

// Webhooks by Zapier sends no signature, so there is nothing to sign here.
// Tests send the same credentials a Zap would: the X-Webhook-Secret header
// added in the Headers section, or Basic Auth from the "user|password" field.
const SECRET = 'a3f1c9e07b2d4e6f8a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f';
const USERNAME = 'zapier';
const PASSWORD = 'pa55:w0rd' // ':' is allowed; '|' is not (Zapier's Basic Auth field splits on it);
const URL = 'http://localhost:3000/webhooks/zapier';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

const basic = (u: string, p: string) =>
  `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;

function setEnv({ secret = '', username = '', password = '' } = {}) {
  process.env.ZAPIER_WEBHOOK_SECRET = secret;
  process.env.ZAPIER_BASIC_AUTH_USERNAME = username;
  process.env.ZAPIER_BASIC_AUTH_PASSWORD = password;
}

function makeRequest(
  body: string,
  headers: Record<string, string> = {},
  method = 'POST'
): NextRequest {
  return new NextRequest(URL, {
    method,
    body,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

beforeEach(() => setEnv({ secret: SECRET }));
afterAll(() => setEnv());

describe('shared-secret header', () => {
  it('accepts a JSON payload with the correct X-Webhook-Secret', async () => {
    const res = await POST(
      makeRequest(JSON.stringify({ first_name: 'Bryan', age: 27 }), {
        'x-webhook-secret': SECRET,
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event: 'zap action' });
  });

  it('accepts a Form (URL-encoded) payload', async () => {
    const res = await POST(
      makeRequest('first_name=Bryan&last_name=Helmig&age=27', {
        'content-type': 'application/x-www-form-urlencoded',
        'x-webhook-secret': SECRET,
      })
    );
    expect(res.status).toBe(200);
  });

  it('accepts a Custom Request sent with PATCH', async () => {
    const res = await PATCH(makeRequest('{"id":42}', { 'x-webhook-secret': SECRET }, 'PATCH'));
    expect(res.status).toBe(200);
  });

  it('accepts a raw XML body sent with PUT', async () => {
    const res = await PUT(
      makeRequest(
        '<first_name>Bryan</first_name>',
        { 'content-type': 'application/xml', 'x-webhook-secret': SECRET },
        'PUT'
      )
    );
    expect(res.status).toBe(200);
  });

  it('dispatches on a user-defined event field', async () => {
    const res = await POST(
      makeRequest(JSON.stringify({ event: 'lead.created' }), { 'x-webhook-secret': SECRET })
    );
    expect((await res.json()).event).toBe('lead.created');
  });

  it('rejects a wrong secret with 401', async () => {
    const res = await POST(
      makeRequest('{}', { 'x-webhook-secret': SECRET.slice(0, -1) + '0' })
    );
    expect(res.status).toBe(401);
  });

  it('rejects a missing secret with 401', async () => {
    expect((await POST(makeRequest('{}'))).status).toBe(401);
  });

  it('rejects a different-length secret without throwing', async () => {
    const res = await POST(makeRequest('{}', { 'x-webhook-secret': 'short' }));
    expect(res.status).toBe(401);
  });

  it('authenticates before parsing: bad JSON without credentials is 401', async () => {
    expect((await POST(makeRequest('{not json'))).status).toBe(401);
  });

  it('returns 400 for malformed JSON with valid credentials', async () => {
    const res = await POST(makeRequest('{not json', { 'x-webhook-secret': SECRET }));
    expect(res.status).toBe(400);
  });
});

describe('Basic Auth', () => {
  beforeEach(() => setEnv({ username: USERNAME, password: PASSWORD }));

  it('accepts correct credentials (password may contain a colon)', async () => {
    const res = await POST(makeRequest('{}', { authorization: basic(USERNAME, PASSWORD) }));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong password', async () => {
    const res = await POST(makeRequest('{}', { authorization: basic(USERNAME, 'nope') }));
    expect(res.status).toBe(401);
  });

  it('rejects a non-Basic scheme', () => {
    expect(verifyBasicAuth(`Bearer ${PASSWORD}`, USERNAME, PASSWORD)).toBe(false);
  });

  it('accepts either method when both are configured', async () => {
    setEnv({ secret: SECRET, username: USERNAME, password: PASSWORD });
    const viaHeader = await POST(makeRequest('{}', { 'x-webhook-secret': SECRET }));
    const viaBasic = await POST(makeRequest('{}', { authorization: basic(USERNAME, PASSWORD) }));
    expect(viaHeader.status).toBe(200);
    expect(viaBasic.status).toBe(200);
  });
});

describe('fail closed', () => {
  it('returns 500 when nothing is configured', async () => {
    setEnv();
    expect((await POST(makeRequest('{}', { 'x-webhook-secret': '' }))).status).toBe(500);
    expect(verifyZapierRequest(new Headers())).toBeNull();
  });

  it('ignores a half-configured Basic Auth pair', () => {
    setEnv({ username: USERNAME });
    const headers = new Headers({ authorization: basic(USERNAME, '') });
    expect(verifyZapierRequest(headers)).toBeNull();
  });
});

describe('parseBody', () => {
  it('parses form bodies into an object', () => {
    expect(parseBody('a=1&b=two', 'application/x-www-form-urlencoded')).toEqual({ a: '1', b: 'two' });
  });

  it('returns other content types as text', () => {
    expect(parseBody('raw', 'text/plain')).toBe('raw');
  });
});
