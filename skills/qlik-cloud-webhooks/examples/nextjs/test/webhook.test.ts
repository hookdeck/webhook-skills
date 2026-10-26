import crypto from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, GET, PATCH, POST, PUT } from '../app/webhooks/qlik-cloud/route';
import { verifyQlikSignature } from '../lib/verify-qlik-cloud';

// Qlik Cloud secrets are 32-64 characters, used as UTF-8 bytes (not decoded).
const SECRET = 'qlik-test-secret-0123456789abcdefghijklmn';
const URL = 'http://localhost:3000/webhooks/qlik-cloud';

// Signed exactly as Qlik Cloud signs: lowercase hex HMAC-SHA256 of the raw body bytes.
function sign(body: string | Uint8Array, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Payloads as shown in Qlik's docs (qlik.dev/apis/event)
const reloadFinished = {
  id: 'b347fd0d-1321-417f-91ee-90e96c76389c',
  time: '2018-10-30T07:06:22Z',
  type: 'com.qlik.v1.reload.finished',
  source: 'com.qlik/reloads',
  specversion: '1.0',
  datacontenttype: 'application/json',
  tenantid: 'UkeLb6ICti8OA8f3LueRI5kVNtuHc15f',
  data: {
    id: '6a849f7f18ec290e6ceb025d',
    appId: '002ff8c5-3c11-4464-a22b-68fb5e7ee5e8',
    userId: '5be59decca62aa00097268a4',
    succeeded: true,
  },
};

const changeStoreSaved = {
  id: 'id123',
  type: 'com.qlik.analytics.change-store.changes.saved',
  source: 'com.qlik/write-table',
  specversion: '1.0',
  data: { storeId: 'store012', spaceId: 'space123', committedAt: '2024-01-01T12:20:00Z' },
};

// Pre-hybrid payload (the help page's example): only eventType, data.attributes
const legacyAppDeleted = {
  cloudEventsVersion: '0.1',
  source: 'com.qlik/engine',
  eventId: 'e65c1481-e8a-4be-a5ca-27dfcde077d7',
  eventType: 'com.qlik.v1.app.deleted',
  data: { attributes: { id: '0984fec4-aa8c-4253-b1d1-4fd4f9c78', name: 'New App' } },
};

function req(method: string, headers: Record<string, string> = {}, body?: string | Uint8Array): NextRequest {
  return new NextRequest(URL, { method, headers, body: body as BodyInit | undefined });
}

function post(body: string | Uint8Array, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['qlik-signature'] = signature;
  return POST(req('POST', headers, body));
}

beforeEach(() => {
  process.env.QLIK_CLOUD_WEBHOOK_SECRET = SECRET;
});

describe('verifyQlikSignature', () => {
  const body = new TextEncoder().encode(JSON.stringify(reloadFinished));

  it('accepts a valid lowercase hex signature and uppercase hex', () => {
    expect(verifyQlikSignature(body, sign(body))).toBe(true);
    expect(verifyQlikSignature(body, sign(body).toUpperCase())).toBe(true);
  });

  it('verifies over zero bytes for an empty body', () => {
    expect(verifyQlikSignature(new Uint8Array(0), sign(new Uint8Array(0)))).toBe(true);
  });

  it('rejects a missing or empty signature', () => {
    expect(verifyQlikSignature(body, null)).toBe(false);
    expect(verifyQlikSignature(body, '')).toBe(false);
  });

  it('rejects a wrong length, non-hex characters or a prefix', () => {
    const good = sign(body);
    expect(verifyQlikSignature(body, good.slice(0, 63))).toBe(false);
    expect(verifyQlikSignature(body, good + '0')).toBe(false);
    expect(verifyQlikSignature(body, 'z'.repeat(64))).toBe(false);
    expect(verifyQlikSignature(body, `sha256=${good}`)).toBe(false);
    expect(verifyQlikSignature(body, `${good}\n`)).toBe(false);
  });

  it('rejects another secret or other bytes, and fails closed without a secret', () => {
    expect(verifyQlikSignature(body, sign(body, 'x'.repeat(40)))).toBe(false);
    expect(verifyQlikSignature(new TextEncoder().encode(JSON.stringify(reloadFinished, null, 2)), sign(body))).toBe(false);
    expect(verifyQlikSignature(body, sign(body), '')).toBe(false);
  });
});

describe('POST /webhooks/qlik-cloud', () => {
  it('accepts signed reload.finished, change-store and legacy payloads', async () => {
    for (const payload of [reloadFinished, changeStoreSaved, legacyAppDeleted]) {
      const body = JSON.stringify(payload);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    }
  });

  it('verifies the exact bytes, so reformatted JSON needs its own signature', async () => {
    const compact = JSON.stringify(reloadFinished);
    const pretty = JSON.stringify(reloadFinished, null, 2);
    expect((await post(pretty, sign(compact))).status).toBe(401);
    expect((await post(pretty, sign(pretty))).status).toBe(200);
  });

  it('accepts any content type', async () => {
    const body = JSON.stringify(reloadFinished);
    expect((await post(body, sign(body), 'text/plain')).status).toBe(200);
    expect((await post(body, sign(body), 'application/cloudevents+json')).status).toBe(200);
  });

  it('rejects a missing, malformed or wrong signature with 401', async () => {
    const body = JSON.stringify(reloadFinished);
    expect((await post(body)).status).toBe(401);
    expect((await post(body, '')).status).toBe(401);
    expect((await post(body, 'abc')).status).toBe(401);
    expect((await post(body, sign(body, 'y'.repeat(40)))).status).toBe(401);
  });

  it('rejects a body changed after signing', async () => {
    const body = JSON.stringify(reloadFinished);
    expect((await post(body.replace('true', 'false'), sign(body))).status).toBe(401);
  });

  it('answers 400 for a verified body that is not a JSON object', async () => {
    expect((await post('not json', sign('not json'), 'text/plain')).status).toBe(400);
    expect((await post('[1,2]', sign('[1,2]'))).status).toBe(400);
  });

  it('verifies non-UTF-8 bytes as bytes', async () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x80]);
    expect((await post(bytes, sign(bytes), 'application/octet-stream')).status).toBe(400); // verified, not JSON
  });

  it('ignores wrong-typed fields instead of failing with 500', async () => {
    for (const payload of [
      { type: 42, data: 'x' },
      { type: 'com.qlik.v1.reload.finished', data: [1, 2] },
      { type: 'com.qlik.v1.app.deleted', data: { attributes: 'nope', id: 7 } },
      { eventType: { a: 1 }, data: null },
      {},
    ]) {
      const body = JSON.stringify(payload);
      expect((await post(body, sign(body))).status).toBe(200);
    }
  });

  it('returns 500 when the secret is not set', async () => {
    delete process.env.QLIK_CLOUD_WEBHOOK_SECRET;
    const body = JSON.stringify(reloadFinished);
    expect((await post(body, sign(body))).status).toBe(500);
  });
});

describe('other methods', () => {
  it('acknowledges a signed GET with no body (verified over zero bytes)', async () => {
    const res = await GET(req('GET', { 'qlik-signature': sign('') }));
    expect(res.status).toBe(200);
  });

  it('rejects an unsigned GET', async () => {
    expect((await GET(req('GET'))).status).toBe(401);
  });

  it('accepts a signed PUT, PATCH and DELETE with a body', async () => {
    const body = JSON.stringify(reloadFinished);
    const headers = { 'content-type': 'application/json', 'qlik-signature': sign(body) };
    for (const [method, handler] of [['PUT', PUT], ['PATCH', PATCH], ['DELETE', DELETE]] as const) {
      expect((await handler(req(method, headers, body))).status).toBe(200);
    }
  });
});
