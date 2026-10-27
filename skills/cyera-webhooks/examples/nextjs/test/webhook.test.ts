// Generated with: cyera-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/cyera/route';
import { verifyCyeraSignature } from '../lib/cyera';

// Cyera's docs show Webhook Secrets that look like `dgwebhook...`; the whole
// string is the HMAC key (UTF-8 bytes), never decoded.
const SECRET = 'dgwebhook_test_secret_key';
process.env.CYERA_WEBHOOK_SECRET = SECRET;
delete process.env.CYERA_WEBHOOK_TOLERANCE_SECONDS;

// Payloads follow the samples in Cyera's webhook docs.
const ACCESS: Record<string, any> = {
  request_type: 'access',
  integration_name: 'Webhook Integration',
  integration_kind: 'webhook',
  topic: 'privacy_request:create',
  identifiers: { email: [{ email: 'john@example.com' }], user_id: [{ user_id: '100101' }] },
  webhook_callback_url: 'https://acme.privacy.cyera.io/api/v2/webhooks/callback',
  privacy_request_id: '4b7a02e2-361e-4957-9d69-b381e3f47758',
  integration_id: '4b7a02e2-361e-4957-9d69-b381e3f47758',
  webhook_request_id: '3aa32ca6-e60d-4b71-981a-d1ba258fd712',
};
// The docs do not include a deletion sample; same shape with request_type deletion.
const DELETION: Record<string, any> = { ...ACCESS, request_type: 'deletion' };
const HEALTH_CHECK: Record<string, any> = {
  request_type: 'health_check',
  integration_name: 'Webhook Integration',
  integration_kind: 'webhook',
  webhook_request_id: '3aa32ca6-e60d-4b71-981a-d1ba258fd712',
};
const OPT_OUT: Record<string, any> = {
  request_type: 'opt_out',
  integration_name: 'Webhook Integration',
  integration_kind: 'webhook',
  topic: 'opt_out:create',
  identifiers: { email: [{ email: 'john@example.com' }] },
  webhook_callback_url: 'https://acme.privacy.cyera.io/api/v2/webhooks/callback',
  opt_out_request_id: '206356d2-80de-492c-bd34-b0093b6f5d25',
  integration_state_id: 123456789,
  webhook_request_id: '9bfacff3-c454-4212-9417-88e246e1798f',
};
const READINESS_CHECK: Record<string, any> = {
  request_type: 'readiness_check',
  integration_name: 'Webhook Integration',
  integration_kind: 'webhook',
  identifiers: { email: [{ email: 'john@example.com' }] },
  webhook_callback_url: 'https://acme.privacy.cyera.io/api/v2/webhooks/callback',
  privacy_request_id: '80edbafc-4ec6-45a0-b341-73080457890e',
  integration_id: '7efa58a8-9b7d-4faf-8082-5f7f7f407db7',
  webhook_request_id: '46093148-5087-423d-81b5-88c22701c642',
  question: 'Is the system ready to process this request?',
  answers: ['Yes', 'No'],
};

const nowSeconds = () => String(Math.floor(Date.now() / 1000));

// Same algorithm as Cyera: base64(HMAC-SHA256(secret, timestamp + ":" + body)).
function sign(rawBody: Buffer, timestamp: string, secret = SECRET): string {
  return crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from(':'), rawBody]))
    .digest('base64');
}

interface PostOptions {
  timestamp?: string | null;
  signature?: string | null;
  contentType?: string;
}

async function post(body: unknown, opts: PostOptions = {}) {
  const raw = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const timestamp = opts.timestamp === undefined ? nowSeconds() : opts.timestamp;
  const signature =
    opts.signature === undefined ? (timestamp === null ? null : sign(raw, timestamp)) : opts.signature;

  const headers: Record<string, string> = { 'content-type': opts.contentType ?? 'application/json' };
  if (signature !== null) headers['x-webhook-signature'] = signature;
  if (timestamp !== null) headers['x-webhook-timestamp'] = timestamp;

  const request = new NextRequest('http://localhost/webhooks/cyera', {
    method: 'POST',
    headers,
    body: raw.length ? new Uint8Array(raw) : undefined,
  });
  return POST(request);
}

describe('Cyera webhook route', () => {
  afterEach(() => {
    delete process.env.CYERA_WEBHOOK_TOLERANCE_SECONDS;
    process.env.CYERA_WEBHOOK_SECRET = SECRET;
  });

  describe('valid deliveries', () => {
    it.each([
      ['access', ACCESS, 201],
      ['deletion', DELETION, 201],
      ['opt_out', OPT_OUT, 201],
      ['health_check', HEALTH_CHECK, 200],
      ['readiness_check', READINESS_CHECK, 200],
    ])('accepts a signed %s request', async (_name, payload, status) => {
      expect((await post(payload)).status).toBe(status);
    });

    it('verifies the exact bytes, not a re-serialized body', async () => {
      const raw = Buffer.from('{\n  "request_type" : "health_check",\n  "note":"caf\u00e9 \u2713"\n}\n', 'utf8');
      expect((await post(raw)).status).toBe(200);
    });

    it('accepts any content type', async () => {
      expect((await post(HEALTH_CHECK, { contentType: 'text/plain' })).status).toBe(200);
    });

    it('acknowledges unknown request types with 200', async () => {
      expect((await post({ request_type: 'something_new' })).status).toBe(200);
    });
  });

  describe('rejections (401)', () => {
    const raw = Buffer.from(JSON.stringify(HEALTH_CHECK));

    it('rejects a missing signature', async () => {
      expect((await post(HEALTH_CHECK, { signature: null })).status).toBe(401);
    });

    it('rejects an empty signature', async () => {
      expect((await post(HEALTH_CHECK, { signature: '' })).status).toBe(401);
    });

    it('rejects a missing timestamp', async () => {
      expect((await post(raw, { timestamp: null, signature: sign(raw, nowSeconds()) })).status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const ts = nowSeconds();
      expect((await post(raw, { timestamp: ts, signature: sign(raw, ts, 'wrong_secret') })).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const signed = Buffer.from(JSON.stringify(ACCESS));
      const ts = nowSeconds();
      const tampered = Buffer.from(JSON.stringify({ ...ACCESS, topic: 'privacy_request:delete' }));
      expect((await post(tampered, { timestamp: ts, signature: sign(signed, ts) })).status).toBe(401);
    });

    it('rejects a changed timestamp', async () => {
      expect((await post(raw, { timestamp: '1700000001', signature: sign(raw, '1700000000') })).status).toBe(401);
    });

    it('rejects a signature over the wrong separator (timestamp.body)', async () => {
      const ts = nowSeconds();
      const dotted = crypto.createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('base64');
      expect((await post(raw, { timestamp: ts, signature: dotted })).status).toBe(401);
    });

    it('rejects a prefixed signature', async () => {
      const ts = nowSeconds();
      expect((await post(raw, { timestamp: ts, signature: `sha256=${sign(raw, ts)}` })).status).toBe(401);
    });

    it('rejects a hex-encoded digest', async () => {
      const ts = nowSeconds();
      const hex = crypto
        .createHmac('sha256', SECRET)
        .update(Buffer.concat([Buffer.from(`${ts}:`), raw]))
        .digest('hex');
      expect((await post(raw, { timestamp: ts, signature: hex })).status).toBe(401);
    });

    it('rejects an unpadded or URL-safe base64 digest', async () => {
      const ts = nowSeconds();
      const good = sign(raw, ts);
      expect((await post(raw, { timestamp: ts, signature: good.slice(0, -1) })).status).toBe(401);
      expect((await post(raw, { timestamp: ts, signature: good.replace(/\+/g, '-').replace(/\//g, '_') + 'x' })).status).toBe(401);
    });

    it('rejects a signature with the wrong letter case', async () => {
      const ts = nowSeconds();
      const swapped = sign(raw, ts)
        .split('')
        .map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
        .join('');
      expect((await post(raw, { timestamp: ts, signature: swapped })).status).toBe(401);
    });

    it('rejects a signature with garbage characters', async () => {
      const ts = nowSeconds();
      const sig = sign(raw, ts);
      expect((await post(raw, { timestamp: ts, signature: `${sig.slice(0, 20)}!!${sig.slice(22)}` })).status).toBe(401);
    });

    it('rejects an empty body with a signature for a different body', async () => {
      const ts = nowSeconds();
      expect((await post(Buffer.alloc(0), { timestamp: ts, signature: sign(Buffer.from('{}'), ts) })).status).toBe(401);
    });
  });

  describe('after verification', () => {
    it('returns 400 for a correctly signed non-JSON body', async () => {
      expect((await post('not json')).status).toBe(400);
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.CYERA_WEBHOOK_SECRET;
      expect((await post(HEALTH_CHECK)).status).toBe(500);
    });
  });

  describe('optional timestamp tolerance', () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 3600);

    it('accepts an old timestamp when tolerance is off (default)', async () => {
      expect((await post(HEALTH_CHECK, { timestamp: oldTs })).status).toBe(200);
    });

    it('rejects an old timestamp when tolerance is set', async () => {
      process.env.CYERA_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await post(HEALTH_CHECK, { timestamp: oldTs })).status).toBe(401);
    });

    it('accepts a fresh timestamp when tolerance is set', async () => {
      process.env.CYERA_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await post(HEALTH_CHECK)).status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.CYERA_WEBHOOK_TOLERANCE_SECONDS = '0';
      expect((await post(HEALTH_CHECK, { timestamp: oldTs })).status).toBe(200);
    });
  });

  describe('verifyCyeraSignature()', () => {
    it('returns valid for a correct signature', () => {
      const raw = Buffer.from(JSON.stringify(ACCESS));
      expect(verifyCyeraSignature(raw, sign(raw, '1700000000'), '1700000000', SECRET).valid).toBe(true);
    });

    it('returns an error message for a mismatch', () => {
      const raw = Buffer.from(JSON.stringify(ACCESS));
      const result = verifyCyeraSignature(raw, sign(raw, '1700000000', 'other'), '1700000000', SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
