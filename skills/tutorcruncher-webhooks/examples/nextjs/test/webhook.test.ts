import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/tutorcruncher/route';
import { verifyTutorCruncherSignature } from '../lib/verify-tutorcruncher';

// TutorCruncher signs with the integration's private API key (used as UTF-8 bytes, as-is).
const SECRET = 'test_tutorcruncher_private_api_key_0123456789';

beforeAll(() => {
  process.env.TUTORCRUNCHER_WEBHOOK_SECRET = SECRET;
});

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

// Based on the documented CREATED_A_CONTRACTOR sample.
function samplePayload(action = 'CREATED_A_CONTRACTOR') {
  return {
    events: [
      {
        action,
        verb: 'Created a Tutor',
        timestamp: '2025-03-05T15:26:20.558919Z',
        branch: 590,
        actor: { name: 'Jane Smith', id: 1621, user_id: 1611, url: '' },
        extra_msg: 'Created via the API.',
        subject: {
          model: 'Tutor',
          url: 'https://app.tutorcruncher.com/api/contractors/1623/',
          id: 1623,
          status: 'approved',
          last_name: 'Gallagher',
          email: 'liam@example.com',
        },
      },
    ],
  };
}

// Bare lowercase hex HMAC-SHA256 of the raw body bytes: no prefix, id or timestamp.
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(
  body: string | null,
  headers: Record<string, string> = {},
  method = 'POST'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/tutorcruncher', {
    method,
    headers,
    ...(body === null ? {} : { body }),
  });
}

function signed(body: string, extra: Record<string, string> = {}) {
  return { 'content-type': 'application/json', 'webhook-signature': sign(body), ...extra };
}

describe('/webhooks/tutorcruncher', () => {
  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await POST(makeRequest(body, signed(body)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts an uppercase hex digest (hex is case-insensitive)', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await POST(makeRequest(body, signed(body, { 'webhook-signature': sign(body).toUpperCase() })));
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, whatever the content type', async () => {
      const body = '{ "events" : [ ] }\n';
      const res = await POST(makeRequest(body, signed(body, { 'content-type': 'text/plain' })));
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature', async () => {
      const res = await POST(makeRequest(JSON.stringify(samplePayload()), { 'content-type': 'application/json' }));
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await POST(makeRequest(body, signed(body, { 'webhook-signature': '' })));
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with the wrong key', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await POST(makeRequest(body, signed(body, { 'webhook-signature': sign(body, 'another_key') })));
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await POST(makeRequest(body.replace('1623', '9999'), signed(body)));
      expect(res.status).toBe(401);
    });

    it('rejects a digest with the wrong length, a prefix or non-hex characters', async () => {
      const body = JSON.stringify(samplePayload());
      const good = sign(body);
      for (const bad of [good.slice(0, 63), `${good}0`, `sha256=${good}`, `v1,${good}`, 'z'.repeat(64)]) {
        const res = await POST(makeRequest(body, signed(body, { 'webhook-signature': bad })));
        expect(res.status).toBe(401);
      }
    });

    it('does not accept an unconfigured secret', () => {
      const body = new TextEncoder().encode('{}');
      expect(verifyTutorCruncherSignature(body, sign('{}', ''), '')).toBe(false);
      expect(verifyTutorCruncherSignature(body, undefined, SECRET)).toBe(false);
    });
  });

  describe('HTTP methods', () => {
    it.each([
      ['PUT', PUT],
      ['PATCH', PATCH],
      ['DELETE', DELETE],
    ])('verifies and accepts %s with a body', async (method, handler) => {
      const body = JSON.stringify(samplePayload());
      const res = await handler(makeRequest(body, signed(body), method));
      expect(res.status).toBe(200);
    });

    it.each([
      ['GET', GET],
      ['DELETE', DELETE],
      ['POST', POST],
    ])('acknowledges a verified %s with no body (signed over zero bytes)', async (method, handler) => {
      const res = await handler(makeRequest(null, { 'webhook-signature': sign('') }, method));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('rejects an unsigned GET', async () => {
      const res = await GET(makeRequest(null, {}, 'GET'));
      expect(res.status).toBe(401);
    });
  });

  describe('events', () => {
    it.each([
      ['CREATED_A_CONTRACTOR', 'Tutor created'],
      ['CHANGED_CONTRACTOR_STATUS', 'Tutor status changed'],
      ['CLIENT_ENQUIRY', 'Client enquiry'],
      ['CREATED_AN_APPOINTMENT', 'Lesson created'],
      ['RAISED_INVOICE', 'Invoice raised'],
    ])('handles %s', async (action, message) => {
      const body = JSON.stringify(samplePayload(action));
      const res = await POST(makeRequest(body, signed(body)));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(message));
    });

    it('handles every element of events', async () => {
      const body = JSON.stringify({
        events: [samplePayload('CREATED_A_CONTRACTOR').events[0], samplePayload('RAISED_INVOICE').events[0]],
      });
      const res = await POST(makeRequest(body, signed(body)));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Tutor created'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Invoice raised'));
    });

    it('acknowledges an unknown action', async () => {
      const body = JSON.stringify(samplePayload('LOGIN'));
      const res = await POST(makeRequest(body, signed(body)));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled action: LOGIN');
    });
  });

  describe('untrusted payload shapes (after a valid signature)', () => {
    const send = (body: string) => POST(makeRequest(body, signed(body)));

    it('returns 400 for invalid JSON', async () => {
      expect((await send('not json')).status).toBe(400);
    });

    it.each(['[]', '"text"', '42', 'null', '{}', '{"events":"x"}', '{"events":{"action":"LOGIN"}}'])(
      'returns 400 for body %s',
      async (body) => {
        expect((await send(body)).status).toBe(400);
      }
    );

    it('ignores wrong-typed elements and fields instead of failing', async () => {
      const body = JSON.stringify({
        events: [
          null,
          7,
          'x',
          [],
          { action: 5 },
          { action: 'CREATED_A_CONTRACTOR', subject: 'oops' },
          { action: 'RAISED_INVOICE', subject: null },
        ],
      });
      expect((await send(body)).status).toBe(200);
    });
  });
});
