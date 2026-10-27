import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/onramper/route';
import { verifyOnramperSignature } from '../lib/verify-onramper';

// Onramper issues an arbitrary secret string; it is used as-is as UTF-8 bytes.
const SECRET = 'test_onramper_webhook_secret';

beforeAll(() => {
  process.env.ONRAMPER_WEBHOOK_SECRET = SECRET;
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Payload from Onramper's documented sample
const pending = {
  apiKey: 'pk_test_01K4MF4ZBPGDCV3GFFNA684NT0',
  country: 'us',
  inAmount: 100,
  onramp: 'gatefi',
  onrampTransactionId: '8bf94c80-test-aabb-851-143835984d1d',
  outAmount: 3.83527521,
  paymentMethod: 'creditcard',
  partnerContext: '',
  sourceCurrency: 'usd',
  status: 'pending',
  statusDate: '2023-08-09T13:15:18.725Z',
  targetCurrency: 'sol',
  transactionId: '01H7D547TESTV2RQJ52ZAB7WF7',
  transactionType: 'buy',
  transactionHash: '',
  walletAddress: 'testG15oy66q7cU6aNige54PxLLEfGZvRsAADjbF7D4',
};

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/onramper', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/onramper', () => {
  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const body = JSON.stringify(pending);
      const res = await POST(makeRequest(body, { 'x-onramper-webhook-signature': sign(body) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts an uppercase hex signature', async () => {
      const body = JSON.stringify(pending);
      const res = await POST(
        makeRequest(body, { 'x-onramper-webhook-signature': sign(body).toUpperCase() })
      );
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, not re-serialized JSON', async () => {
      const body = JSON.stringify(pending, null, 2);
      const res = await POST(makeRequest(body, { 'x-onramper-webhook-signature': sign(body) }));
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature', async () => {
      const res = await POST(makeRequest(JSON.stringify(pending)));
      expect(res.status).toBe(401);
    });

    it('rejects a signature signed with the wrong secret', async () => {
      const body = JSON.stringify(pending);
      const res = await POST(
        makeRequest(body, { 'x-onramper-webhook-signature': sign(body, 'other_secret') })
      );
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = JSON.stringify(pending);
      const res = await POST(
        makeRequest(body.replace('"inAmount":100', '"inAmount":1'), {
          'x-onramper-webhook-signature': sign(body),
        })
      );
      expect(res.status).toBe(401);
    });

    it('rejects malformed signatures without throwing', async () => {
      const body = JSON.stringify(pending);
      const good = sign(body);
      for (const bad of [
        good.slice(0, 62),
        `${good}00`,
        `${good.slice(0, 63)}z`,
        `sha256=${good}`,
        '',
      ]) {
        const res = await POST(makeRequest(body, { 'x-onramper-webhook-signature': bad }));
        expect(res.status).toBe(401);
      }
    });

    it('rejects everything when the secret is not configured', async () => {
      const body = JSON.stringify(pending);
      delete process.env.ONRAMPER_WEBHOOK_SECRET;
      const res = await POST(makeRequest(body, { 'x-onramper-webhook-signature': sign(body) }));
      process.env.ONRAMPER_WEBHOOK_SECRET = SECRET;
      expect(res.status).toBe(401);
    });
  });

  describe('status events', () => {
    for (const status of ['completed', 'paid', 'pending', 'new', 'failed', 'canceled']) {
      it(`handles status ${status}`, async () => {
        const body = JSON.stringify({ ...pending, status });
        const res = await POST(makeRequest(body, { 'x-onramper-webhook-signature': sign(body) }));
        expect(res.status).toBe(200);
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining(pending.transactionId));
      });
    }

    it('handles an offramp transaction', async () => {
      const body = JSON.stringify({ ...pending, status: 'completed', transactionType: 'offramp' });
      const res = await POST(makeRequest(body, { 'x-onramper-webhook-signature': sign(body) }));
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('(offramp)'));
    });

    it('logs and accepts an unknown status', async () => {
      const body = JSON.stringify({ ...pending, status: 'something_else' });
      const res = await POST(makeRequest(body, { 'x-onramper-webhook-signature': sign(body) }));
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unhandled status'));
    });
  });

  it('returns 400 for a signed but invalid JSON body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-onramper-webhook-signature': sign(body) }));
    expect(res.status).toBe(400);
  });
});

describe('verifyOnramperSignature', () => {
  it('works on a Uint8Array body', () => {
    const body = new TextEncoder().encode('{"status":"new"}');
    expect(verifyOnramperSignature(body, sign('{"status":"new"}'), SECRET)).toBe(true);
    expect(verifyOnramperSignature(body, sign('{"status":"new"}'), 'nope')).toBe(false);
  });
});
