import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { verifyExpoSignature, classifyPayload } from '../lib/verify-expo';
import { POST } from '../app/webhooks/expo/route';

// Expo secrets are any string of at least 16 characters you pass to `eas webhook:create`
const SECRET = 'test_expo_webhook_secret';

beforeEach(() => {
  process.env.EXPO_WEBHOOK_SECRET = SECRET;
});

/**
 * Sign like EAS: "sha1=" + hex(HMAC-SHA1(secret, rawBody))
 */
function sign(body: string, secret = SECRET): string {
  return 'sha1=' + crypto.createHmac('sha1', secret).update(body, 'utf8').digest('hex');
}

function makeRequest(body: string, signature?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (signature) headers['expo-signature'] = signature;
  return new Request('http://localhost/webhooks/expo', {
    method: 'POST',
    headers,
    body,
  }) as unknown as NextRequest;
}

const buildPayload = {
  id: '147a3212-49fd-446f-b4e3-a6519acf264a',
  accountName: 'dsokal',
  projectName: 'example',
  buildDetailsPageUrl: 'https://expo.dev/accounts/dsokal/projects/example/builds/147a3212-49fd-446f-b4e3-a6519acf264a',
  platform: 'android',
  status: 'finished',
  artifacts: { buildUrl: 'https://expo.dev/artifacts/eas/wyodu9tua2ZuKKiaJ1Nbkn.aab' },
  metadata: { appVersion: '1.0.2', buildProfile: 'production' },
};

const submitPayload = {
  id: '0374430d-7776-44ad-be7d-8513629adc54',
  accountName: 'dsokal',
  projectName: 'example',
  submissionDetailsPageUrl: 'https://expo.dev/accounts/dsokal/projects/example/builds/0374430d-7776-44ad-be7d-8513629adc54',
  archiveUrl: 'http://archive.url/abc.apk',
  platform: 'android',
  status: 'errored',
  submissionInfo: {
    error: { message: 'Android version code needs to be updated', errorCode: 'SUBMISSION_SERVICE_ANDROID_OLD_VERSION_CODE_ERROR' },
  },
};

describe('verifyExpoSignature', () => {
  it('accepts a valid signature over the raw body', () => {
    const body = JSON.stringify(buildPayload);
    expect(verifyExpoSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('uses the sha1= prefix with a 40-char hex digest', () => {
    expect(sign('{}')).toMatch(/^sha1=[a-f0-9]{40}$/);
  });

  it('rejects a signature without the sha1= prefix', () => {
    const body = JSON.stringify(buildPayload);
    expect(verifyExpoSignature(body, sign(body).slice(5), SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify(buildPayload);
    expect(verifyExpoSignature(body.replace('finished', 'errored'), sign(body), SECRET)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const body = JSON.stringify(buildPayload);
    expect(verifyExpoSignature(body, sign(body, 'another_secret_value'), SECRET)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    const body = JSON.stringify(buildPayload);
    expect(verifyExpoSignature(body, null, SECRET)).toBe(false);
    expect(verifyExpoSignature(body, sign(body), undefined)).toBe(false);
  });
});

describe('classifyPayload', () => {
  it('identifies build and submit payloads by their fields', () => {
    expect(classifyPayload(buildPayload as never)).toBe('BUILD');
    expect(classifyPayload(submitPayload as never)).toBe('SUBMIT');
    expect(classifyPayload({ id: 'x' })).toBe('UNKNOWN');
  });
});

describe('POST /webhooks/expo', () => {
  it('returns 400 when expo-signature is missing', async () => {
    const res = await POST(makeRequest(JSON.stringify(buildPayload)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing expo-signature header' });
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(JSON.stringify(buildPayload), 'sha1=' + 'a'.repeat(40)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it('returns 400 for a malformed signature', async () => {
    const res = await POST(makeRequest(JSON.stringify(buildPayload), 'not-a-signature'));
    expect(res.status).toBe(400);
  });

  it.each(['finished', 'errored', 'canceled'])('accepts a signed build with status %s', async (status) => {
    const body = JSON.stringify({ ...buildPayload, status });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'BUILD' });
  });

  it.each(['finished', 'errored', 'canceled'])('accepts a signed submission with status %s', async (status) => {
    const body = JSON.stringify({ ...submitPayload, status });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'SUBMIT' });
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(buildPayload);
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const res = await POST(makeRequest('not json', sign('not json'), 'text/plain'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.EXPO_WEBHOOK_SECRET;
    const body = JSON.stringify(buildPayload);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(500);
  });
});
