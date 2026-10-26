import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/halo-psa/route';
import { parseBasicAuth, verifyHaloPsaRequest } from '../lib/verify-halo-psa';

const USER = 'halo-webhook';
const PASSWORD = 'test_halo_password:with:colons';

beforeAll(() => {
  process.env.HALO_PSA_WEBHOOK_USERNAME = USER;
  process.env.HALO_PSA_WEBHOOK_PASSWORD = PASSWORD;
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Illustrative: Halo's docs don't spell out the property names.
function samplePayload(event = 'New Ticket Logged') {
  return { id: 1, event, object_id: 4021, timestamp: '2026-10-25T10:00:00Z' };
}

function basic(user: string, password: string): string {
  return 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/halo-psa', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

const authed = (body?: string, extra: Record<string, string> = {}) =>
  makeRequest({ authorization: basic(USER, PASSWORD), ...extra }, body);

describe('HaloPSA webhook endpoint', () => {
  describe('Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await POST(authed());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('treats the scheme as case-insensitive', async () => {
      const res = await POST(makeRequest({ authorization: basic(USER, PASSWORD).replace('Basic', 'bAsIc') }));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon (password may contain colons)', () => {
      expect(parseBasicAuth(basic('u', 'a:b:c'))).toEqual({ username: 'u', password: 'a:b:c' });
    });

    it('rejects a missing Authorization header', async () => {
      expect((await POST(makeRequest())).status).toBe(401);
    });

    it('rejects a wrong password of the same length', async () => {
      const res = await POST(makeRequest({ authorization: basic(USER, 'x'.repeat(PASSWORD.length)) }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username with the right password', async () => {
      const res = await POST(makeRequest({ authorization: basic('someone-else', PASSWORD) }));
      expect(res.status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      expect((await POST(makeRequest({ authorization: `Bearer ${PASSWORD}` }))).status).toBe(401);
    });

    it('rejects credentials with no colon', async () => {
      const value = 'Basic ' + Buffer.from('halo-webhook').toString('base64');
      expect((await POST(makeRequest({ authorization: value }))).status).toBe(401);
    });

    it('rejects valid credentials followed by junk', async () => {
      const valid = basic(USER, PASSWORD);
      for (const bad of [`${valid}=junk`, `${valid} junk`, `${valid}!!`]) {
        expect((await POST(makeRequest({ authorization: bad }))).status).toBe(401);
      }
    });

    it('rejects characters outside the base64 alphabet and bad lengths', () => {
      expect(parseBasicAuth('Basic dXNlcjpwYXN-')).toBeNull();
      expect(parseBasicAuth('Basic dXNlcjpwYXNz=')).toBeNull();
    });

    it('rejects invalid UTF-8 in the decoded credentials', () => {
      const bytes = Buffer.concat([Buffer.from('user:'), Buffer.from([0xff, 0xfe, 0x41])]);
      expect(parseBasicAuth('Basic ' + bytes.toString('base64'))).toBeNull();
    });

    it('rejects when credentials are not configured', () => {
      const headers = new Headers({ authorization: basic('a', 'b') });
      expect(verifyHaloPsaRequest(headers, {})).toBe(false);
      expect(verifyHaloPsaRequest(new Headers({ authorization: basic('', '') }), {})).toBe(false);
    });

    it('handles non-ASCII credentials', () => {
      const config = { HALO_PSA_WEBHOOK_USERNAME: 'ünï', HALO_PSA_WEBHOOK_PASSWORD: 'pässwörd' };
      expect(verifyHaloPsaRequest(new Headers({ authorization: basic('ünï', 'pässwörd') }), config)).toBe(true);
      expect(verifyHaloPsaRequest(new Headers({ authorization: basic('ünï', 'passwörd') }), config)).toBe(false);
    });

    it('authenticates before parsing the body', async () => {
      expect((await POST(makeRequest({}, 'not json'))).status).toBe(401);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(authed(undefined, { 'content-type': 'text/plain' }));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      expect((await POST(authed('not json'))).status).toBe(400);
    });

    it('returns 400 for a JSON scalar', async () => {
      expect((await POST(authed('"hello"'))).status).toBe(400);
    });

    it('accepts a batched delivery (JSON array)', async () => {
      const batch = [samplePayload('New Ticket Logged'), samplePayload('Ticket Reassigned')];
      expect((await POST(authed(JSON.stringify(batch)))).status).toBe(200);
    });

    it('returns 400 for an array containing non-objects', async () => {
      expect((await POST(authed('[1,2]'))).status).toBe(400);
    });
  });

  describe('Event handling', () => {
    it.each([
      'New Ticket Logged',
      'Ticket Reassigned',
      'Document deleted on a Ticket',
      'Document edited on a Ticket',
    ])('handles "%s"', async (event) => {
      const res = await POST(authed(JSON.stringify(samplePayload(event))));
      expect(res.status).toBe(200);
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled event'));
    });

    it('acknowledges unhandled events', async () => {
      const res = await POST(authed(JSON.stringify(samplePayload('Something Else'))));
      expect(res.status).toBe(200);
    });
  });
});
