import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, GET, DELETE } from '../app/webhooks/agentset/route';
import { verifyAgentsetSignature } from '../lib/verify-agentset';

const SECRET = 'agentset_test_secret_0123456789';

beforeAll(() => {
  process.env.AGENTSET_WEBHOOK_SECRET = SECRET;
});

// Payloads follow Agentset's documented examples.
const DOCUMENT_READY = {
  id: 'evt_pqr678stu901',
  event: 'document.ready',
  createdAt: '2024-08-26T16:50:00.000Z',
  data: {
    id: 'doc_k8f2m9x3n4p1',
    name: 'product-guide.pdf',
    namespaceId: 'ns_j7h3k9m2n5p8',
    organizationId: 'org_x9y8z7w6v5u4',
    status: 'READY',
    source: { type: 'FILE', fileUrl: 'https://example.com/sample.pdf' },
    totalCharacters: 45230,
    totalChunks: 32,
    totalPages: 15,
    error: null,
    createdAt: '2024-08-26T16:41:52.084Z',
    updatedAt: '2024-08-26T16:50:00.000Z',
  },
};

const DOCUMENT_ERROR = {
  id: 'evt_mno345pqr678',
  event: 'document.error',
  createdAt: '2024-08-26T16:45:00.000Z',
  data: {
    id: 'doc_r5t6u7v8w9x0',
    name: 'corrupted-file.pdf',
    namespaceId: 'ns_j7h3k9m2n5p8',
    organizationId: 'org_x9y8z7w6v5u4',
    status: 'FAILED',
    source: { type: 'FILE', fileUrl: 'https://example.com/sample.pdf' },
    error: 'Failed to parse PDF: file appears to be corrupted',
  },
};

const INGEST_JOB_QUEUED = {
  id: 'evt_aaa111bbb222',
  event: 'ingest_job.queued',
  createdAt: '2024-08-26T20:00:00.000Z',
  data: {
    id: 'job_q1w2e3r4t5y6',
    name: 'Website crawl - docs.example.com',
    namespaceId: 'ns_j7h3k9m2n5p8',
    organizationId: 'org_x9y8z7w6v5u4',
    status: 'QUEUED',
    error: null,
  },
};

const sign = (body: string, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('hex');

const handlers = { POST, PUT, PATCH, GET, DELETE } as const;
type Method = keyof typeof handlers;

interface SendOptions {
  body?: string | null;
  signature?: string | null; // undefined = sign the body, null = omit the header
  type?: string;
}

async function send(method: Method, { body = JSON.stringify(DOCUMENT_READY), signature, type = 'application/json' }: SendOptions = {}) {
  const headers: Record<string, string> = {};
  const sig = signature === undefined ? sign(body ?? '') : signature;
  if (sig !== null) headers['agentset-signature'] = sig;
  if (body !== null) headers['content-type'] = type;
  const request = new NextRequest('http://localhost:3000/webhooks/agentset', {
    method,
    headers,
    ...(body === null ? {} : { body }),
  });
  return handlers[method](request);
}

describe('/webhooks/agentset', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const res = await send('POST');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts an uppercase hex signature', async () => {
      const body = JSON.stringify(DOCUMENT_READY);
      expect((await send('POST', { body, signature: sign(body).toUpperCase() })).status).toBe(200);
    });

    it('rejects a missing signature header', async () => {
      expect((await send('POST', { signature: null })).status).toBe(401);
    });

    it('rejects an empty signature header', async () => {
      expect((await send('POST', { signature: '' })).status).toBe(401);
    });

    it('rejects a wrong signature of the right shape', async () => {
      expect((await send('POST', { signature: 'a'.repeat(64) })).status).toBe(401);
    });

    it('rejects a signature made with another secret', async () => {
      const body = JSON.stringify(DOCUMENT_READY);
      expect((await send('POST', { body, signature: sign(body, 'other') })).status).toBe(401);
    });

    it('rejects a sha256= prefix (the value is a bare digest)', async () => {
      const body = JSON.stringify(DOCUMENT_READY);
      expect((await send('POST', { body, signature: `sha256=${sign(body)}` })).status).toBe(401);
    });

    it.each([
      ['too short', (s: string) => s.slice(0, 63)],
      ['too long', (s: string) => `${s}0`],
      ['non-hex characters', (s: string) => `${s.slice(0, 63)}z`],
      ['wrapped in quotes', (s: string) => `"${s}"`],
    ])('rejects a malformed signature (%s)', async (_label, mutate) => {
      const body = JSON.stringify(DOCUMENT_READY);
      expect((await send('POST', { body, signature: mutate(sign(body)) })).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const signature = sign(JSON.stringify(DOCUMENT_READY));
      const tampered = JSON.stringify({ ...DOCUMENT_READY, event: 'document.deleted' });
      expect((await send('POST', { body: tampered, signature })).status).toBe(401);
    });

    it('verifies the exact bytes, not a re-serialized body', async () => {
      const spaced = JSON.stringify(DOCUMENT_READY, null, 2);
      expect((await send('POST', { body: spaced })).status).toBe(200);
      const compact = JSON.stringify(DOCUMENT_READY);
      expect((await send('POST', { body: spaced, signature: sign(compact) })).status).toBe(401);
    });

    it('signs only the body: no timestamp header is needed', async () => {
      expect((await send('POST')).status).toBe(200);
    });

    it('rejects everything when the secret is not configured', () => {
      const body = Buffer.from('{}');
      const sig = sign('{}');
      expect(verifyAgentsetSignature(body, sig, '')).toBe(false);
      expect(verifyAgentsetSignature(body, undefined, SECRET)).toBe(false);
      expect(verifyAgentsetSignature(body, sig, SECRET)).toBe(true);
    });
  });

  describe('methods and bodies', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as Method[])('accepts a signed %s', async (method) => {
      expect((await send(method)).status).toBe(200);
    });

    it('verifies a GET with no body over zero bytes and acknowledges it', async () => {
      const res = await send('GET', { body: null, signature: sign('') });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('rejects a GET with no body and a bad signature', async () => {
      expect((await send('GET', { body: null, signature: 'a'.repeat(64) })).status).toBe(401);
    });

    it('verifies before looking at the body', async () => {
      expect((await send('DELETE', { signature: null })).status).toBe(401);
    });

    it('accepts any content type', async () => {
      const body = JSON.stringify(DOCUMENT_READY);
      expect((await send('POST', { body, type: 'text/plain' })).status).toBe(200);
      expect((await send('POST', { body, type: 'application/octet-stream' })).status).toBe(200);
    });

    it('returns 400 for a signed body that is not JSON', async () => {
      expect((await send('POST', { body: 'not json' })).status).toBe(400);
    });

    it.each(['[]', '"text"', '42', 'null'])('returns 400 for signed non-object JSON (%s)', async (body) => {
      expect((await send('POST', { body })).status).toBe(400);
    });
  });

  describe('event handling', () => {
    it.each([
      [DOCUMENT_READY, 'Document ready: doc_k8f2m9x3n4p1'],
      [DOCUMENT_ERROR, 'Document failed: doc_r5t6u7v8w9x0'],
      [{ ...DOCUMENT_READY, event: 'document.deleted' }, 'Document deleted: doc_k8f2m9x3n4p1'],
      [{ ...INGEST_JOB_QUEUED, event: 'ingest_job.ready' }, 'Ingest job ready: job_q1w2e3r4t5y6'],
      [{ ...INGEST_JOB_QUEUED, event: 'ingest_job.error' }, 'Ingest job failed: job_q1w2e3r4t5y6'],
    ])('handles %#', async (payload, expected) => {
      const res = await send('POST', { body: JSON.stringify(payload) });
      expect(res.status).toBe(200);
      expect(logSpy.mock.calls.flat().join('\n')).toContain(expected);
    });

    it('logs events it does not handle', async () => {
      const res = await send('POST', { body: JSON.stringify(INGEST_JOB_QUEUED) });
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled event: ingest_job.queued');
    });

    it.each([
      ['data is a string', { event: 'document.ready', data: 'oops' }],
      ['data is an array', { event: 'document.error', data: [1, 2] }],
      ['data is null', { event: 'ingest_job.error', data: null }],
      ['event is a number', { event: 5, data: {} }],
      ['nested fields have wrong types', { event: 'document.ready', data: { id: 7, name: {}, error: [] } }],
      ['no event', { data: {} }],
    ])('ignores wrong-typed fields without a 500 (%s)', async (_label, payload) => {
      const res = await send('POST', { body: JSON.stringify(payload) });
      expect(res.status).toBe(200);
    });
  });
});
