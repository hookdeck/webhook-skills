import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/lumos/route';
import { verifyLumosRequest } from '../lib/verify-lumos';

const SECRET = 'Bearer test_lumos_secret_0123456789';

beforeAll(() => {
  process.env.LUMOS_WEBHOOK_SECRET = SECRET;
  delete process.env.LUMOS_WEBHOOK_HEADER; // default: Authorization
});

// Illustrative payload: Lumos does not publish the field names.
function samplePayload() {
  return {
    user: { email: 'ada@example.com', given_name: 'Ada', family_name: 'Lovelace' },
    account: { id: 'acct_123', email: 'ada@example.com', username: 'ada' },
    application: { name: 'Zendesk', instance_id: 'inst_456' },
    permissions: ['Agent License'],
    comment: 'Offboarding',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/lumos', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/lumos', () => {
  describe('custom header verification', () => {
    it('accepts the correct Authorization value (whole value, with Bearer)', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix: the bare token is rejected', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ Authorization: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('does not accept the Lumos signature header as the credential', async () => {
      const res = await POST(makeRequest({ 'X-Lumos-Webhook-Signature': SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when LUMOS_WEBHOOK_SECRET is unset', () => {
      const headers = new Headers({ Authorization: SECRET });
      expect(verifyLumosRequest(headers, 'Authorization', '')).toBe(false);
      delete process.env.LUMOS_WEBHOOK_SECRET;
      expect(verifyLumosRequest(headers)).toBe(false);
      process.env.LUMOS_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('LUMOS_WEBHOOK_HEADER', () => {
    afterEach(() => {
      delete process.env.LUMOS_WEBHOOK_HEADER;
    });

    it('reads the credential from the configured header', async () => {
      process.env.LUMOS_WEBHOOK_HEADER = 'X-Api-Key';
      const ok = await POST(makeRequest({ 'X-Api-Key': SECRET }));
      expect(ok.status).toBe(200);
      const wrongHeader = await POST(makeRequest({ Authorization: SECRET }));
      expect(wrongHeader.status).toBe(401);
    });

    it('compares non-ASCII values without throwing', () => {
      const headers = new Headers({ 'X-Api-Key': 'café' });
      expect(verifyLumosRequest(headers, 'X-Api-Key', 'café')).toBe(true);
      expect(verifyLumosRequest(headers, 'X-Api-Key', 'cafe')).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without credentials', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });

    it('handles a payload with no recognised fields', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: SECRET }, '{}'));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
