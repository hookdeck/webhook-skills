import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { verifyAtlasSignature } from '../lib/verify-atlas';
import { POST } from '../app/webhooks/mongodb-atlas/route';

// Atlas Webhook Secrets are any string you choose; used as a raw string key
const SECRET = 'test_atlas_webhook_secret';

beforeEach(() => {
  process.env.MONGODB_ATLAS_WEBHOOK_SECRET = SECRET;
});

/**
 * Sign like Atlas: base64(HMAC-SHA1(secret, raw body))
 */
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha1', secret).update(body, 'utf8').digest('base64');
}

function makeRequest(body: string, signature?: string, event = 'alert.open'): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-MMS-Event': event,
  };
  if (signature) headers['X-MMS-Signature'] = signature;
  return new Request('http://localhost/webhooks/mongodb-atlas', {
    method: 'POST',
    headers,
    body,
  }) as unknown as NextRequest;
}

const metricAlert = {
  id: '5d1b6f8e8c2e4e2d3c4a5b6c',
  groupId: '5d1b6f8e8c2e4e2d3c4a5b6d',
  eventTypeName: 'OUTSIDE_METRIC_THRESHOLD',
  status: 'OPEN',
  humanReadable: 'Disk space used on data partition is 95.2%. Project: MyProject Organization: MyOrganization',
  metricName: 'DISK_PARTITION_SPACE_USED_DATA',
  currentValue: { number: 95.2, units: 'RAW' },
};

const hostDownAlert = {
  id: '5d1b6f8e8c2e4e2d3c4a5b6e',
  eventTypeName: 'HOST_DOWN',
  status: 'CLOSED',
  humanReadable: 'Host is down',
};

describe('verifyAtlasSignature', () => {
  it('accepts a valid signature over the raw body', () => {
    const body = JSON.stringify(metricAlert);
    expect(verifyAtlasSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('produces a 28-char base64 HMAC-SHA1 digest', () => {
    expect(sign('{}')).toMatch(/^[A-Za-z0-9+/]{27}=$/);
  });

  it('rejects a hex-encoded signature', () => {
    const body = JSON.stringify(metricAlert);
    const hex = crypto.createHmac('sha1', SECRET).update(body).digest('hex');
    expect(verifyAtlasSignature(body, hex, SECRET)).toBe(false);
  });

  it('rejects a SHA-256 signature', () => {
    const body = JSON.stringify(metricAlert);
    const sha256 = crypto.createHmac('sha256', SECRET).update(body).digest('base64');
    expect(verifyAtlasSignature(body, sha256, SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify(metricAlert);
    expect(verifyAtlasSignature(body.replace('95.2', '1.0'), sign(body), SECRET)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const body = JSON.stringify(metricAlert);
    expect(verifyAtlasSignature(body, sign(body, 'wrong'), SECRET)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    const body = JSON.stringify(metricAlert);
    expect(verifyAtlasSignature(body, null, SECRET)).toBe(false);
    expect(verifyAtlasSignature(body, sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/mongodb-atlas', () => {
  it('returns 400 when X-MMS-Signature is missing', async () => {
    const res = await POST(makeRequest(JSON.stringify(metricAlert)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing X-MMS-Signature header' });
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(JSON.stringify(metricAlert), 'AAAAAAAAAAAAAAAAAAAAAAAAAAA='));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });

  it.each([
    ['OUTSIDE_METRIC_THRESHOLD', metricAlert, 'alert.open'],
    ['HOST_DOWN', hostDownAlert, 'alert.close'],
    ['unknown event type', { id: 'x', eventTypeName: 'SOMETHING_ELSE', status: 'OPEN' }, 'alert.update'],
  ])('accepts a signed %s alert', async (_name, alert, event) => {
    const body = JSON.stringify(alert);
    const res = await POST(makeRequest(body, sign(body), event));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.MONGODB_ATLAS_WEBHOOK_SECRET;
    const body = JSON.stringify(metricAlert);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(500);
  });
});
