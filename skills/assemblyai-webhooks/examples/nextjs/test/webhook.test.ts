import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/assemblyai/route';
import { verifyAssemblyAIRequest } from '../lib/verify-assemblyai';

const NAME = 'X-My-Webhook-Secret';
const VALUE = 'test_assemblyai_secret_0123456789';

beforeAll(() => {
  process.env.ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME = NAME;
  process.env.ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE = VALUE;
});

// What AssemblyAI delivers: only the transcript ID and a status
function samplePayload(status = 'completed') {
  return { transcript_id: '5552493-16d8-42d8-8feb-c2a16b56f6e8', status };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/assemblyai', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/assemblyai', () => {
  describe('Auth header', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [NAME]: VALUE }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [NAME.toLowerCase()]: VALUE }));
      expect(res.status).toBe(200);
    });

    it('verifies regardless of content type', async () => {
      const res = await POST(makeRequest({ [NAME]: VALUE }, JSON.stringify(samplePayload()), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ [NAME]: 'x'.repeat(VALUE.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [NAME]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects when the header is missing', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the value sent under a different header name', async () => {
      const res = await POST(makeRequest({ 'X-Other-Header': VALUE }));
      expect(res.status).toBe(401);
    });
  });

  describe('Request handling', () => {
    it('returns 400 for an invalid JSON body', async () => {
      const res = await POST(makeRequest({ [NAME]: VALUE }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ [NAME]: VALUE }, '[1,2,3]'));
      expect(res.status).toBe(400);
    });

    it('handles completed, error and unknown statuses', async () => {
      for (const status of ['completed', 'error', 'queued']) {
        const res = await POST(makeRequest({ [NAME]: VALUE }, JSON.stringify(samplePayload(status))));
        expect(res.status).toBe(200);
      }
    });
  });

  describe('verifyAssemblyAIRequest', () => {
    it('rejects everything when nothing is configured', () => {
      expect(verifyAssemblyAIRequest(new Headers({ [NAME]: VALUE }), {})).toBe(false);
    });

    it('rejects when only the name is configured', () => {
      const config = { ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME: 'X-Token' };
      expect(verifyAssemblyAIRequest(new Headers({ 'x-token': '' }), config)).toBe(false);
    });

    it('uses a custom header name', () => {
      const config = {
        ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME: 'X-AAI-Token',
        ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE: 's3cret',
      };
      expect(verifyAssemblyAIRequest(new Headers({ 'x-aai-token': 's3cret' }), config)).toBe(true);
      expect(verifyAssemblyAIRequest(new Headers({ [NAME]: 's3cret' }), config)).toBe(false);
    });
  });
});
