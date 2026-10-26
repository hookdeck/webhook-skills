import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/maximizer/route';
import { verifyMaximizerRequest } from '../lib/verify-maximizer';

const HEADER = 'X-Maximizer-Auth';
const SECRET = 'Bearer test_maximizer_secret_0123456789';

const EVENTS: [string, string][] = [
  ['AbEntry', 'Create'], ['AbEntry', 'Update'], ['AbEntry', 'Delete'],
  ['Opportunity', 'Create'], ['Opportunity', 'Update'], ['Opportunity', 'Delete'],
  ['Lead', 'Create'], ['Lead', 'Update'], ['Lead', 'Delete'],
];

beforeAll(() => {
  process.env.MAXIMIZER_WEBHOOK_HEADER = HEADER;
  process.env.MAXIMIZER_WEBHOOK_SECRET = SECRET;
});

// Shape from https://developer.maximizer.com/docs/webhooks (an array; Op lives in Data).
function sampleWebhook(entity = 'Opportunity', op = 'Update') {
  return {
    Id: 'd81f9d6e-8afc-4fa4-9052-2af207494e5d',
    Timestamp: '2024-09-20T00:01:29.5149836Z',
    ProcessedTimestamp: '2024-09-20T00:02:45.8974002Z',
    WorkspaceId: '108F314C-6787-4EE6-BE49-C0E0C651F039',
    SourceId: '1a0dde7c-743f-4b55-a2bf-e7738393a8e5',
    Recipients: [],
    Options: null,
    Entity: entity,
    Data: {
      Op: op,
      Original: op === 'Create' ? null : { Key: 'T3Bwb3J0dW5pdHkJMjQwOTE5' },
      New: op === 'Delete' ? null : { Key: 'T3Bwb3J0dW5pdHkJMjQwOTE5', Objective: 'Test Opportunity' },
      Version: '1.1',
    },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify([sampleWebhook()]),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/maximizer', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/maximizer', () => {
  describe('Credential header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent in a different header', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('defaults the header name to Authorization', () => {
      const headers = new Headers({ authorization: 'Bearer abc' });
      expect(verifyMaximizerRequest(headers, 'Bearer abc', 'Authorization')).toBe(true);
      expect(verifyMaximizerRequest(headers, 'Bearer abc', 'X-Other')).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyMaximizerRequest(headers, '', HEADER)).toBe(false);
      expect(verifyMaximizerRequest(headers, SECRET, HEADER)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify([sampleWebhook()]), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON object (Maximizer sends an array)', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(sampleWebhook())));
      expect(res.status).toBe(400);
    });

    it('returns 400 for an array of non-objects', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the credential', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });

    it('accepts an empty array', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[]'));
      expect(res.status).toBe(200);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s.%s', async (entity, op) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify([sampleWebhook(entity, op)]))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('handles every webhook in a batch', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const batch = [sampleWebhook('AbEntry', 'Create'), sampleWebhook('Lead', 'Delete')];
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(batch)));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.map(([m]) => String(m))).toEqual([
        expect.stringContaining('Contact created'),
        expect.stringContaining('Lead deleted'),
      ]);
      spy.mockRestore();
    });

    it('accepts a lower-case Op', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify([sampleWebhook('Lead', 'create')]))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown entities', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify([sampleWebhook('UnknownEntity', 'Create')]))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
