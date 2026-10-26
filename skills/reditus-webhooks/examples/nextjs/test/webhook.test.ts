import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, GET, DELETE } from '../app/webhooks/reditus/route';
import { verifyReditusSignature } from '../lib/verify-reditus';

const SECRET = 'test_reditus_webhook_secret';

beforeAll(() => {
  process.env.REDITUS_WEBHOOK_SECRET = SECRET;
});

// Payload shaped like the partnership.accepted example in Reditus's docs.
function samplePayload(eventType = 'partnership.accepted', data?: unknown) {
  return {
    event_type: eventType,
    url: 'destination-url@example.com',
    created_at: '2024-05-05',
    data: data ?? {
      affiliate_name: 'Acme',
      affiliate_email: 'john@acme.com',
      affiliate_first_name: 'John',
      affiliate_last_name: 'Doe',
      accepted_at: '2024-05-05',
    },
  };
}

// Real signature, same as Reditus: lowercase hex HMAC-SHA256 of the raw body, nothing else.
const sign = (body: string | Uint8Array, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('hex');

function makeRequest(
  body: string | null,
  { signature, method = 'POST', contentType = 'application/json' }: { signature?: string | null; method?: string; contentType?: string } = {}
): NextRequest {
  const sig = signature === undefined ? sign(body ?? '') : signature;
  const headers: Record<string, string> = { 'content-type': contentType };
  if (sig !== null) headers['x-signature'] = sig;
  return new NextRequest('http://localhost:3000/webhooks/reditus', {
    method,
    headers,
    ...(body === null ? {} : { body }),
  });
}

describe('/webhooks/reditus', () => {
  const body = JSON.stringify(samplePayload());

  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts an uppercase hex signature (hex is case-insensitive)', async () => {
      expect((await POST(makeRequest(body, { signature: sign(body).toUpperCase() }))).status).toBe(200);
    });

    it('rejects a missing signature', async () => {
      expect((await POST(makeRequest(body, { signature: null }))).status).toBe(401);
    });

    it('rejects an empty signature', async () => {
      expect((await POST(makeRequest(body, { signature: '' }))).status).toBe(401);
    });

    it('rejects a wrong signature of the right shape', async () => {
      expect((await POST(makeRequest(body, { signature: 'a'.repeat(64) }))).status).toBe(401);
    });

    it('rejects a signature made with another secret', async () => {
      expect((await POST(makeRequest(body, { signature: sign(body, 'other') }))).status).toBe(401);
    });

    it('rejects a short signature', async () => {
      expect((await POST(makeRequest(body, { signature: sign(body).slice(0, 62) }))).status).toBe(401);
    });

    it('rejects a long signature', async () => {
      expect((await POST(makeRequest(body, { signature: sign(body) + 'ab' }))).status).toBe(401);
    });

    it('rejects a non-hex signature of the right length', async () => {
      expect((await POST(makeRequest(body, { signature: 'z'.repeat(64) }))).status).toBe(401);
    });

    it('rejects a prefixed signature (the header is the bare digest)', async () => {
      expect((await POST(makeRequest(body, { signature: `sha256=${sign(body)}` }))).status).toBe(401);
    });

    it('rejects a body changed after signing', async () => {
      const res = await POST(makeRequest(body.replace('Acme', 'Evil'), { signature: sign(body) }));
      expect(res.status).toBe(401);
    });

    it('verifies the exact bytes: reformatted JSON with the same content fails', async () => {
      const pretty = JSON.stringify(samplePayload(), null, 2);
      expect((await POST(makeRequest(pretty, { signature: sign(body) }))).status).toBe(401);
    });

    it('verifies the exact bytes including non-ASCII characters and a trailing newline', async () => {
      const raw = JSON.stringify(samplePayload('lead.created', { lead_email: 'zoë@example.com' })) + '\n';
      expect((await POST(makeRequest(raw))).status).toBe(200);
    });

    it('verifies the secret as UTF-8 bytes (no hex or base64 decoding)', () => {
      const raw = Buffer.from('{}');
      expect(verifyReditusSignature(raw, sign(raw, 'deadbeef'), 'deadbeef')).toBe(true);
      expect(verifyReditusSignature(raw, sign(raw, 'deadbeef'), 'deadbeee')).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const raw = Buffer.from('{}');
      expect(verifyReditusSignature(raw, sign(raw, 'x'), '')).toBe(false);
    });
  });

  describe('methods and bodies', () => {
    const handlers = { POST, PUT, PATCH, DELETE };

    it.each(Object.entries(handlers))('accepts a signed %s with a body', async (method, handler) => {
      expect((await handler(makeRequest(body, { method }))).status).toBe(200);
    });

    it.each(Object.entries({ ...handlers, GET }))('rejects an unsigned %s', async (method, handler) => {
      const res = await handler(makeRequest(method === 'GET' ? null : body, { method, signature: null }));
      expect(res.status).toBe(401);
    });

    it('verifies a GET with no body over zero bytes and acknowledges it', async () => {
      const res = await GET(makeRequest(null, { method: 'GET' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('rejects a GET with no body and a wrong signature', async () => {
      expect((await GET(makeRequest(null, { method: 'GET', signature: 'a'.repeat(64) }))).status).toBe(401);
    });

    it('accepts any content type', async () => {
      expect((await POST(makeRequest(body, { contentType: 'text/plain' }))).status).toBe(200);
      expect((await POST(makeRequest(body, { contentType: 'application/octet-stream' }))).status).toBe(200);
    });

    it('answers 400 for a signed body that is not JSON', async () => {
      expect((await POST(makeRequest('not json'))).status).toBe(400);
    });

    it.each(['[]', '"text"', '42', 'null'])('answers 400 for signed non-object JSON %s', async (raw) => {
      expect((await POST(makeRequest(raw))).status).toBe(400);
    });
  });

  describe('events', () => {
    const events: Record<string, unknown> = {
      'partnership.accepted': { affiliate_name: 'Acme', affiliate_email: 'john@acme.com' },
      'referral.created': { affiliate_email: 'a@example.com', referral_id: '6412-smga-1314-munw', referral_uid: 'r1', referral_email: 'john@example.com' },
      'advocate.created': { advocate_uid: 'u1', advocate_id: '6412-smga-1314-munw', advocate_slug: 'jwe512', advocate_email: 'john@example.com' },
      'lead.created': { advocate_uid: 'u1', lead_id: '6412-smga-1314-munw', lead_uid: 'l1', lead_email: 'john@example.com' },
      'reward.created': { amount: 5521, currency: 'usd', advocate_uid: 'u1', lead_id: 'l1', reward_id: '9182-agja-1891-awia', custom_text: 'Awesome Hoodie' },
    };

    it.each(Object.entries(events))('handles %s', async (eventType, data) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest(JSON.stringify(samplePayload(eventType, data))));
      expect(res.status).toBe(200);
      expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
      log.mockRestore();
    });

    it('logs and acknowledges an unknown event', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest(JSON.stringify(samplePayload('something.else', {}))));
      expect(res.status).toBe(200);
      expect(log).toHaveBeenCalledWith('Unhandled event: something.else');
      log.mockRestore();
    });

    it.each([
      ['data is a string', { event_type: 'lead.created', data: 'oops' }],
      ['data is an array', { event_type: 'reward.created', data: [1, 2] }],
      ['data is null', { event_type: 'referral.created', data: null }],
      ['fields have the wrong type', { event_type: 'reward.created', data: { amount: '55', currency: 7, reward_id: {} } }],
      ['event_type is a number', { event_type: 5, data: {} }],
      ['event_type is missing', { data: {} }],
    ])('does not 500 when %s', async (_name, payload) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      expect((await POST(makeRequest(JSON.stringify(payload)))).status).toBe(200);
      log.mockRestore();
    });
  });
});
