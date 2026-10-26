import { describe, it, expect, beforeAll, vi } from 'vitest';
import zlib from 'zlib';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/meilisearch/route';
import { parseTasks, verifyMeilisearchRequest } from '../lib/verify-meilisearch';

const SECRET = 'Bearer 9f2c7d1e4b8a4c36a1d05e7b3c9f8a21';

beforeAll(() => {
  process.env.MEILISEARCH_AUTHORIZATION = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// Task objects as returned by the Tasks API (trimmed)
const tasks = [
  { uid: 1, indexUid: 'movies', status: 'succeeded', type: 'documentAdditionOrUpdate', details: { receivedDocuments: 10, indexedDocuments: 10 } },
  { uid: 2, indexUid: 'movies', status: 'failed', type: 'settingsUpdate', error: { message: 'Invalid settings', code: 'invalid_settings' } },
  { uid: 3, indexUid: 'old', status: 'succeeded', type: 'indexDeletion', details: { deletedDocuments: 4 } },
];
const ndjson = tasks.map((t) => JSON.stringify(t)).join('\n') + '\n';
const gz = zlib.gzipSync(ndjson);

function makeRequest({
  body = gz as Buffer | string,
  headers = {} as Record<string, string>,
  gzip = true,
  contentType = 'application/x-ndjson',
} = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/meilisearch', {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
      ...headers,
    },
    body: typeof body === 'string' ? body : new Uint8Array(body),
  });
}

describe('Meilisearch webhook route', () => {
  it('accepts a gzipped multi-line ndjson body with the full Authorization value', async () => {
    const res = await POST(makeRequest({ headers: { Authorization: SECRET } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, tasks: 3 });
  });

  it('accepts an uncompressed ndjson body', async () => {
    const res = await POST(makeRequest({ body: ndjson, gzip: false, headers: { Authorization: SECRET } }));
    expect(res.status).toBe(200);
    expect((await res.json()).tasks).toBe(3);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    expect((await POST(makeRequest({ headers: { Authorization: 'Bearer nope' } }))).status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await POST(makeRequest({ headers: { Authorization: SECRET.replace('Bearer ', '') } }));
    expect(res.status).toBe(401);
  });

  it('checks the credential before decoding the body', async () => {
    const res = await POST(makeRequest({ body: 'not gzip', headers: { Authorization: 'Bearer nope' } }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a body that claims gzip but is not', async () => {
    const res = await POST(makeRequest({ body: 'not gzip', headers: { Authorization: SECRET } }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid ndjson', async () => {
    const bad = zlib.gzipSync('{"uid":1}\nnot json\n');
    expect((await POST(makeRequest({ body: bad, headers: { Authorization: SECRET } }))).status).toBe(400);
  });

  it('returns 400 for a line that is not an object', async () => {
    const bad = zlib.gzipSync('[1,2]\n');
    expect((await POST(makeRequest({ body: bad, headers: { Authorization: SECRET } }))).status).toBe(400);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ contentType: 'text/plain', headers: { Authorization: SECRET } }));
    expect(res.status).toBe(200);
  });

  it('skips blank lines', () => {
    const raw = new TextEncoder().encode('{"uid":1}\n\n{"uid":2}\r\n');
    expect(parseTasks(raw.buffer as ArrayBuffer, null)).toHaveLength(2);
  });

  it('never accepts when MEILISEARCH_AUTHORIZATION is unset', () => {
    expect(verifyMeilisearchRequest(new Headers({ authorization: 'Bearer x' }), {})).toBe(false);
    expect(
      verifyMeilisearchRequest(new Headers({ authorization: '' }), { MEILISEARCH_AUTHORIZATION: '' })
    ).toBe(false);
  });
});
