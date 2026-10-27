import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_purchasely_webhook_secret_0123456789';

let POST: (req: NextRequest) => Promise<Response>;
let verifyPurchaselyRequest: (
  headers: Headers,
  rawBody: Uint8Array,
  secret?: string,
  toleranceSeconds?: number
) => boolean;
let computePurchaselySignature: (timestamp: string, rawBody: Uint8Array, secret: string) => string;

beforeAll(async () => {
  process.env.PURCHASELY_WEBHOOK_SECRET = SECRET;
  delete process.env.PURCHASELY_WEBHOOK_TOLERANCE_SECONDS;
  ({ POST } = await import('../app/webhooks/purchasely/route'));
  ({ verifyPurchaselyRequest, computePurchaselySignature } = await import('../lib/verify-purchasely'));
});

// Independent signer: HMAC-SHA256 hex over timestamp + body, no separator.
function sign(body: string, timestamp: string, secret = SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from(body)]))
    .digest('hex');
}

const nowTs = () => String(Math.floor(Date.now() / 1000));
const bytes = (s: string) => new TextEncoder().encode(s);

// Payload shapes follow the documented samples (SUBSCRIPTION_STARTED, TRANSACTION_PROCESSED, ...)
function samplePayload(eventName = 'SUBSCRIPTION_STARTED', eventId = `evt_${Math.random()}`) {
  return {
    api_version: 3,
    event_id: eventId,
    event_name: eventName,
    event_created_at: '2023-12-12T13:51:04.953Z',
    environment: 'SANDBOX',
    plan: 'monthly',
    product: 'PURCHASELY_PLUS',
    purchasely_subscription_id: 'subs_D7GnVQbUxvY6YxoeK6nhyPDkmyCVcfe',
    store: 'GOOGLE_PLAY_STORE',
    subscription_status: 'AUTO_RENEWING',
    user_id: 'user_123',
    amount_in_eur: 9.99,
  };
}

function makeRequest(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/purchasely', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

function signedRequest(
  body = JSON.stringify(samplePayload()),
  { timestamp = nowTs(), secret = SECRET, contentType = 'application/json' } = {}
) {
  return makeRequest(
    body,
    {
      'x-purchasely-timestamp': timestamp,
      'x-purchasely-request-signature': sign(body, timestamp, secret),
    },
    contentType
  );
}

describe('Purchasely webhook route', () => {
  describe('Published test vector (docs example)', () => {
    // From https://docs.purchasely.com/docs/webhook: secret "foobar", timestamp 1698322022
    const secret = 'foobar';
    const body = '{"a_random_key":"a_random_value_ad"}';
    const headers = new Headers({
      'x-purchasely-timestamp': '1698322022',
      'x-purchasely-request-signature': 'f3c2a452e9ea72f41107321aeaf7999f1054148866a710c9b23f9f501785e2a4',
    });

    it('computes the documented signature', () => {
      expect(computePurchaselySignature('1698322022', bytes(body), secret)).toBe(
        'f3c2a452e9ea72f41107321aeaf7999f1054148866a710c9b23f9f501785e2a4'
      );
    });

    it('verifies the documented request', () => {
      expect(verifyPurchaselyRequest(headers, bytes(body), secret, 0)).toBe(true);
    });

    it('rejects the documented request under a different secret', () => {
      expect(verifyPurchaselyRequest(headers, bytes(body), 'foobaz', 0)).toBe(false);
    });
  });

  describe('Signature verification', () => {
    it('accepts a correctly signed request', async () => {
      const res = await POST(signedRequest());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts any content type (raw body is verified)', async () => {
      const res = await POST(signedRequest(undefined, { contentType: 'text/plain' }));
      expect(res.status).toBe(200);
    });

    it('accepts an uppercase hex digest', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = nowTs();
      const req = makeRequest(body, {
        'x-purchasely-timestamp': ts,
        'x-purchasely-request-signature': sign(body, ts).toUpperCase(),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('verifies multi-byte bodies byte for byte', async () => {
      const res = await POST(signedRequest(JSON.stringify({ ...samplePayload(), plan: 'mensuel é €' })));
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature', async () => {
      const req = makeRequest(JSON.stringify(samplePayload()), { 'x-purchasely-timestamp': nowTs() });
      expect((await POST(req)).status).toBe(401);
    });

    it('rejects a missing timestamp', async () => {
      const body = JSON.stringify(samplePayload());
      const req = makeRequest(body, { 'x-purchasely-request-signature': sign(body, '') });
      expect((await POST(req)).status).toBe(401);
    });

    it('rejects an empty signature header', async () => {
      const req = makeRequest(JSON.stringify(samplePayload()), {
        'x-purchasely-timestamp': nowTs(),
        'x-purchasely-request-signature': '',
      });
      expect((await POST(req)).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const ts = nowTs();
      const signed = JSON.stringify(samplePayload('SUBSCRIPTION_STARTED', 'evt_a'));
      const req = makeRequest(JSON.stringify(samplePayload('SUBSCRIPTION_STARTED', 'evt_b')), {
        'x-purchasely-timestamp': ts,
        'x-purchasely-request-signature': sign(signed, ts),
      });
      expect((await POST(req)).status).toBe(401);
    });

    it('rejects a signature made over a different timestamp', async () => {
      const body = JSON.stringify(samplePayload());
      const req = makeRequest(body, {
        'x-purchasely-timestamp': nowTs(),
        'x-purchasely-request-signature': sign(body, '1698322022'),
      });
      expect((await POST(req)).status).toBe(401);
    });

    it('rejects a signature made with another secret', async () => {
      expect((await POST(signedRequest(undefined, { secret: 'another_secret' }))).status).toBe(401);
    });

    it('rejects a prefixed digest (Purchasely sends bare hex)', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = nowTs();
      const req = makeRequest(body, {
        'x-purchasely-timestamp': ts,
        'x-purchasely-request-signature': `sha256=${sign(body, ts)}`,
      });
      expect((await POST(req)).status).toBe(401);
    });

    it('rejects a 64-character value that is not hex', async () => {
      const req = makeRequest(JSON.stringify(samplePayload()), {
        'x-purchasely-timestamp': nowTs(),
        'x-purchasely-request-signature': 'z'.repeat(64),
      });
      expect((await POST(req)).status).toBe(401);
    });

    it('rejects a digest of the wrong length', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = nowTs();
      const req = makeRequest(body, {
        'x-purchasely-timestamp': ts,
        'x-purchasely-request-signature': sign(body, ts).slice(0, 62),
      });
      expect((await POST(req)).status).toBe(401);
    });

    it('does not use the deprecated X-PURCHASELY-SIGNATURE header', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = nowTs();
      const req = makeRequest(body, { 'x-purchasely-timestamp': ts, 'x-purchasely-signature': sign(body, ts) });
      expect((await POST(req)).status).toBe(401);
    });
  });

  describe('Timestamp tolerance (opt-in)', () => {
    const body = '{"event_name":"SUBSCRIPTION_STARTED"}';
    const oldTs = String(Math.floor(Date.now() / 1000) - 86400);
    const oldHeaders = {
      'x-purchasely-timestamp': oldTs,
      'x-purchasely-request-signature': sign(body, oldTs),
    };

    it('accepts old timestamps by default (retries and replays resend them)', async () => {
      expect((await POST(makeRequest(body, oldHeaders))).status).toBe(200);
    });

    it('rejects old timestamps when a tolerance is set', () => {
      expect(verifyPurchaselyRequest(new Headers(oldHeaders), bytes(body), SECRET, 300)).toBe(false);
    });

    it('accepts recent timestamps when a tolerance is set', () => {
      const ts = nowTs();
      const h = new Headers({ 'x-purchasely-timestamp': ts, 'x-purchasely-request-signature': sign(body, ts) });
      expect(verifyPurchaselyRequest(h, bytes(body), SECRET, 300)).toBe(true);
    });

    it('treats 0 as off', () => {
      expect(verifyPurchaselyRequest(new Headers(oldHeaders), bytes(body), SECRET, 0)).toBe(true);
    });
  });

  describe('Request handling', () => {
    it('returns 400 for a signed body that is not JSON', async () => {
      expect((await POST(signedRequest('{not json'))).status).toBe(400);
    });

    it('returns 400 for a signed JSON array', async () => {
      expect((await POST(signedRequest('[1,2,3]'))).status).toBe(400);
    });

    it('answers exactly 200 for every handled event and unknown events', async () => {
      const names = [
        'SUBSCRIPTION_STARTED', 'SUBSCRIPTION_RENEWED', 'RENEWAL_DISABLED', 'GRACE_PERIOD_STARTED',
        'ENTERED_BILLING_RETRY', 'SUBSCRIPTION_TERMINATED', 'TRANSACTION_PROCESSED', 'ACTIVATE',
        'SOMETHING_NEW',
      ];
      for (const name of names) {
        const res = await POST(signedRequest(JSON.stringify(samplePayload(name))));
        expect(res.status).toBe(200);
        expect((await res.json()).duplicate).toBeUndefined();
      }
    });

    it('skips a retried event with the same event_id', async () => {
      const body = JSON.stringify(samplePayload('SUBSCRIPTION_RENEWED', 'evt_retry_1'));
      const first = await POST(signedRequest(body));
      const second = await POST(signedRequest(body));
      expect(await first.json()).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ received: true, duplicate: true });
    });
  });

  describe('verifyPurchaselyRequest', () => {
    it('rejects everything when no secret is configured', () => {
      const h = new Headers({ 'x-purchasely-timestamp': '1', 'x-purchasely-request-signature': sign('{}', '1', '') });
      expect(verifyPurchaselyRequest(h, bytes('{}'), '', 0)).toBe(false);
    });
  });
});
