import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.HUBSPOT_CLIENT_SECRET = 'test_client_secret';
});

const SECRET = 'test_client_secret';
const URI = 'https://example.com/webhooks/hubspot';
const MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Mirror of verifyHubSpotWebhook in app/webhooks/hubspot/route.ts so we can
 * unit-test the verification logic without importing the Next.js route module.
 */
function verifyHubSpotWebhook(args: {
  method: string;
  uri: string;
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
}): boolean {
  const { method, uri, rawBody, timestamp, signature, secret } = args;
  if (!signature || !timestamp || !secret) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_AGE_MS) return false;

  const signedContent = `${method}${uri}${rawBody}${timestamp}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedContent, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function signHubSpot(opts: {
  method?: string;
  uri?: string;
  body: string;
  timestamp: string;
  secret?: string;
}): string {
  const { method = 'POST', uri = URI, body, timestamp, secret = SECRET } = opts;
  const signedContent = `${method}${uri}${body}${timestamp}`;
  return crypto.createHmac('sha256', secret).update(signedContent, 'utf8').digest('base64');
}

const nowMs = () => Date.now().toString();

describe('HubSpot Signature Verification', () => {
  it('validates a correct signature', () => {
    const body = JSON.stringify([{ subscriptionType: 'contact.creation', objectId: 1 }]);
    const timestamp = nowMs();
    const signature = signHubSpot({ body, timestamp });

    expect(
      verifyHubSpotWebhook({
        method: 'POST',
        uri: URI,
        rawBody: body,
        timestamp,
        signature,
        secret: SECRET,
      })
    ).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(
      verifyHubSpotWebhook({
        method: 'POST',
        uri: URI,
        rawBody: '{}',
        timestamp: nowMs(),
        signature: 'not-a-real-signature',
        secret: SECRET,
      })
    ).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const original = JSON.stringify({ objectId: 1, amount: 100 });
    const tampered = JSON.stringify({ objectId: 1, amount: 999 });
    const timestamp = nowMs();
    const signature = signHubSpot({ body: original, timestamp });

    expect(
      verifyHubSpotWebhook({
        method: 'POST',
        uri: URI,
        rawBody: tampered,
        timestamp,
        signature,
        secret: SECRET,
      })
    ).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const body = '{}';
    const timestamp = nowMs();
    const signature = signHubSpot({ body, timestamp });

    expect(
      verifyHubSpotWebhook({
        method: 'POST',
        uri: URI,
        rawBody: body,
        timestamp,
        signature,
        secret: 'wrong_secret',
      })
    ).toBe(false);
  });

  it('rejects a stale timestamp (older than 5 minutes)', () => {
    const body = '{}';
    const stale = (Date.now() - 6 * 60 * 1000).toString();
    const signature = signHubSpot({ body, timestamp: stale });

    expect(
      verifyHubSpotWebhook({
        method: 'POST',
        uri: URI,
        rawBody: body,
        timestamp: stale,
        signature,
        secret: SECRET,
      })
    ).toBe(false);
  });

  it('rejects when the URI is different', () => {
    const body = '{}';
    const timestamp = nowMs();
    const signature = signHubSpot({ uri: URI, body, timestamp });

    expect(
      verifyHubSpotWebhook({
        method: 'POST',
        uri: 'https://attacker.example.com/webhooks/hubspot',
        rawBody: body,
        timestamp,
        signature,
        secret: SECRET,
      })
    ).toBe(false);
  });

  it('returns false when the signature header is missing', () => {
    expect(
      verifyHubSpotWebhook({
        method: 'POST',
        uri: URI,
        rawBody: '{}',
        timestamp: nowMs(),
        signature: null,
        secret: SECRET,
      })
    ).toBe(false);
  });

  it('returns false when the timestamp header is missing', () => {
    expect(
      verifyHubSpotWebhook({
        method: 'POST',
        uri: URI,
        rawBody: '{}',
        timestamp: null,
        signature: 'anything',
        secret: SECRET,
      })
    ).toBe(false);
  });
});

describe('HubSpot Signature Generation', () => {
  it('produces a base64-encoded signature', () => {
    const signature = signHubSpot({ body: '{"test":true}', timestamp: nowMs() });
    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('is deterministic for the same inputs', () => {
    const body = '{"id":123}';
    const timestamp = '1700000000000';
    const sig1 = signHubSpot({ body, timestamp });
    const sig2 = signHubSpot({ body, timestamp });
    expect(sig1).toBe(sig2);
  });

  it('changes when the body changes', () => {
    const timestamp = nowMs();
    const sig1 = signHubSpot({ body: '{"id":1}', timestamp });
    const sig2 = signHubSpot({ body: '{"id":2}', timestamp });
    expect(sig1).not.toBe(sig2);
  });
});
