import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { verifyOptimizelySignature } from '../lib/verify-optimizely';
import { POST } from '../app/webhooks/optimizely/route';

const SECRET = 'yIRFMTpsBcAKKRjJPCIykNo6EkNxJn_nq01-_r3S8i4';

beforeEach(() => {
  process.env.OPTIMIZELY_WEBHOOK_SECRET = SECRET;
});

// Published test vector from Optimizely's docs (exact body bytes)
const VECTOR_BODY =
  '{"timestamp": 1558138293, "project_id": 11387641093, "data": {"cdn_url": "https://cdn.optimizely.com/datafiles/QMVJcUKEJZFg8pQ2jhAybK.json", "environment": "Production", "origin_url": "https://optimizely.s3.amazonaws.com/datafiles/QMVJcUKEJZFg8pQ2jhAybK.json", "revision": 13}, "event": "project.datafile_updated"}';
const VECTOR_HEADER = 'sha1=b2493723c6ea6973fbda41573222c8ecb1c82666';

// Sign like Optimizely: sha1= + hex(HMAC-SHA1(secret, raw body))
function sign(body: string, secret = SECRET): string {
  return 'sha1=' + crypto.createHmac('sha1', secret).update(body).digest('hex');
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) headers['X-Hub-Signature'] = signature;
  return new Request('http://localhost/webhooks/optimizely', {
    method: 'POST',
    headers,
    body,
  }) as unknown as NextRequest;
}

// Documented sample payload
const datafilePayload = JSON.stringify({
  project_id: 1234,
  timestamp: 1468447113,
  event: 'project.datafile_updated',
  data: {
    revision: 1,
    origin_url: 'https://optimizely.s3.amazonaws.com/json/1234.json',
    cdn_url: 'https://cdn.optimizely.com/json/1234.json',
    environment: 'Production',
  },
});

// Illustrative change-history payload (data is an array of change records)
const rulesetPayload = JSON.stringify({
  project_id: 1234,
  timestamp: 1468447200,
  event: 'project.ruleset_updated',
  data: [{ change_type: 'update', entity: { type: 'ruleset' } }],
});

describe('verifyOptimizelySignature', () => {
  const vector = Buffer.from(VECTOR_BODY);

  it('accepts the published test vector', () => {
    expect(verifyOptimizelySignature(vector, VECTOR_HEADER, SECRET)).toBe(true);
  });

  it('accepts the bare and uppercase digest', () => {
    expect(verifyOptimizelySignature(vector, VECTOR_HEADER.slice(5), SECRET)).toBe(true);
    expect(verifyOptimizelySignature(vector, 'sha1=' + VECTOR_HEADER.slice(5).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects tampered, wrong-secret and malformed values', () => {
    expect(verifyOptimizelySignature(Buffer.from(VECTOR_BODY + ' '), VECTOR_HEADER, SECRET)).toBe(false);
    expect(verifyOptimizelySignature(vector, VECTOR_HEADER, 'wrong')).toBe(false);
    expect(verifyOptimizelySignature(vector, 'sha1=abc', SECRET)).toBe(false);
    expect(verifyOptimizelySignature(vector, 'sha1=' + 'zz'.repeat(20), SECRET)).toBe(false);
    expect(verifyOptimizelySignature(vector, '', SECRET)).toBe(false);
    expect(verifyOptimizelySignature(vector, null, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/optimizely', () => {
  it('accepts the published test vector', async () => {
    const res = await POST(makeRequest(VECTOR_BODY, VECTOR_HEADER));
    expect(res.status).toBe(200);
  });

  it('accepts signed datafile_updated and ruleset_updated events', async () => {
    for (const body of [datafilePayload, rulesetPayload]) {
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    }
  });

  it('returns 401 for a missing, invalid or malformed signature', async () => {
    expect((await POST(makeRequest(datafilePayload))).status).toBe(401);
    expect((await POST(makeRequest(datafilePayload, sign(datafilePayload, 'other')))).status).toBe(401);
    expect((await POST(makeRequest(datafilePayload, 'sha1=nothex'))).status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const res = await POST(makeRequest('not json', sign('not json')));
    expect(res.status).toBe(400);
  });

  it('accepts unknown events', async () => {
    const body = JSON.stringify({ event: 'project.something_else', data: {} });
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.OPTIMIZELY_WEBHOOK_SECRET;
    expect((await POST(makeRequest(datafilePayload, sign(datafilePayload)))).status).toBe(500);
  });
});
