import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/fountain/route';
import { verifyFountainSignature, classify } from '../lib/verify-fountain';

const SECRET = 'test_fountain_private_api_token_0123456789';

beforeAll(() => {
  process.env.FOUNTAIN_WEBHOOK_SECRET = SECRET;
});

// Sample payloads based on the applicant and worker examples in the Fountain docs.
const APPLICANT = {
  applicant: {
    email: 'example@example.com',
    name: 'Logan Paucek',
    id: 'c780d083-6e73-4810-85a9-17e72d5b7a93',
    background_checks: [{ id: 'bc-1', status: 'pending' }],
    funnel: { title: 'Fountain applicants', id: '05e515a8-fe15-4f11-a1a7-98e0aabb0cd6' },
    stage: { title: 'Approved', id: 'e2921e5b-ae20-4c56-9dc8-bb6209e021b7' },
    document_signatures: [],
  },
};

const WORKER = {
  is_active: true,
  name: 'Ms. Isaiah Bernier',
  email: 'dariana_stiedemann@streichfadel.co',
  id: '70bbb9f4-bb94-4dbd-a01c-3a2f9ef3098e',
  approved_at: '2018-05-24T03:31:07.626-07:00',
  data_collection_checks: [{ id: 'a94329ff-47fc-4b9c-8e62-01e0f8e53c91', status: 'pending' }],
};

function sign(body: string | Buffer, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-obiq-signature-v2'] = signature;
  return new NextRequest('http://localhost/webhooks/fountain', { method: 'POST', headers, body });
}

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => logSpy.mockRestore());

describe('Fountain webhook route', () => {
  describe('signature verification', () => {
    it('accepts a valid signature over the raw body', async () => {
      const body = JSON.stringify(APPLICANT);
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('verifies the exact bytes (pretty-printed JSON with unicode)', async () => {
      const body = JSON.stringify({ ...WORKER, name: 'Zoë Müller' }, null, 2);
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
    });

    it('accepts an uppercase hex signature (hex is case-insensitive)', async () => {
      const body = JSON.stringify(WORKER);
      const res = await POST(makeRequest(body, sign(body).toUpperCase()));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const body = JSON.stringify(WORKER);
      const res = await POST(makeRequest(body, sign(body), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature header', async () => {
      const res = await POST(makeRequest(JSON.stringify(APPLICANT)));
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature header', async () => {
      const res = await POST(makeRequest(JSON.stringify(APPLICANT), ''));
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const body = JSON.stringify(APPLICANT);
      const res = await POST(makeRequest(body, sign(body, 'wrong_token')));
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = JSON.stringify(APPLICANT);
      const res = await POST(makeRequest(body.replace('Approved', 'Rejected'), sign(body)));
      expect(res.status).toBe(401);
    });

    it('rejects an applicant-ID signature (unsupported signing mode)', async () => {
      const body = JSON.stringify(APPLICANT);
      const res = await POST(makeRequest(body, sign(APPLICANT.applicant.id)));
      expect(res.status).toBe(401);
    });

    it('rejects prefixed, truncated, long and non-hex signatures without throwing', async () => {
      const body = JSON.stringify(APPLICANT);
      const good = sign(body);
      for (const bad of [`sha256=${good}`, good.slice(0, 62), `${good}00`, 'z'.repeat(64), `${good.slice(0, 32)} ${good.slice(32)}`]) {
        const res = await POST(makeRequest(body, bad));
        expect(res.status).toBe(401);
      }
    });

    it('rejects everything when the secret is unset', () => {
      const body = Buffer.from('{}');
      expect(verifyFountainSignature(body, sign(body), '')).toBe(false);
      delete process.env.FOUNTAIN_WEBHOOK_SECRET;
      expect(verifyFountainSignature(body, sign(body))).toBe(false);
      process.env.FOUNTAIN_WEBHOOK_SECRET = SECRET;
    });

    it('uses the secret as UTF-8 bytes, not decoded', () => {
      const body = Buffer.from('{}');
      const secret = 'deadbeefdeadbeef'; // looks like hex but must not be hex-decoded
      expect(verifyFountainSignature(body, sign(body, secret), secret)).toBe(true);
      const decoded = crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(body).digest('hex');
      expect(verifyFountainSignature(body, decoded, secret)).toBe(false);
    });
  });

  describe('body handling', () => {
    it('returns 400 for invalid JSON after verifying', async () => {
      const body = '{not json';
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await POST(makeRequest('[]', sign('[]')));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a valid signature', async () => {
      const res = await POST(makeRequest('{not json', 'a'.repeat(64)));
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it('handles an applicant (screening) event', async () => {
      const body = JSON.stringify(APPLICANT);
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
      expect(logSpy.mock.calls.some(([m]) => String(m).includes('is in stage: Approved'))).toBe(true);
      expect(logSpy.mock.calls.some(([m]) => String(m).includes('status: pending'))).toBe(true);
    });

    it('handles a worker (Post-Hire) event', async () => {
      const body = JSON.stringify(WORKER);
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
      expect(logSpy.mock.calls.some(([m]) => String(m).includes('is_active=true'))).toBe(true);
    });

    it('classifies payloads by shape', () => {
      expect(classify(APPLICANT)).toBe('applicant');
      expect(classify(WORKER)).toBe('worker');
      expect(classify({ something: 'else' })).toBe(null);
    });

    it('acknowledges an unknown shape', async () => {
      const body = JSON.stringify({ something: 'else' });
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
      expect(logSpy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
    });
  });
});
