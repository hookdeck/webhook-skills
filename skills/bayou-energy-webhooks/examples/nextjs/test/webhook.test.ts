// Generated with: bayou-energy-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/bayou-energy/route';

// Bayou secrets look like "whsec_" + base64(key bytes). The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('bayou-test-signing-key-0123456789').toString('base64');

/** Sign exactly like Bayou does (Standard Webhooks). */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

interface SignOptions {
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
  prefix?: 'webhook' | 'svix';
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id || `wh_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  const prefix = opts.prefix ?? 'webhook';
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/bayou-energy', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

const bill = (event: string) => ({
  event,
  object: {
    id: 12345,
    external_id: 'BILL_123',
    status: 'unlocked',
    customer_id: 123456,
    customer_external_id: 'MSCOTT123',
    utility: 'con_edison',
    total_amount: 12000,
    meters: [],
  },
});

beforeEach(() => {
  process.env.BAYOU_ENERGY_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signing algorithm', () => {
  it("reproduces the signature in Bayou's documented test vector", () => {
    const body = '{"event": "bills_ready", "object": {"id": 123456}}';
    expect(sign(body, 'wh_12345', '1750000000', 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw')).toBe(
      'v1,yW3priuFZD+w+ji8R847LYfQxOKmZlBAHEt7OQP0CMI='
    );
  });
});

describe('valid signatures', () => {
  it.each(['new_bill', 'updated_bill'])('accepts %s', async (name) => {
    const body = JSON.stringify(bill(name));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`${name}: bill 12345`));
  });

  it('accepts bills_ready', async () => {
    const body = JSON.stringify({
      event: 'bills_ready',
      object: { id: 12345, external_id: 'MSCOTT123', bills_parsed: [bill('new_bill').object] },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('1 bills'));
  });

  it('accepts intervals_ready', async () => {
    const body = JSON.stringify({
      event: 'intervals_ready',
      object: {
        id: 12345,
        external_id: 'MSCOTT123',
        first_interval_discovered: '2022-07-01T00:00:00Z',
        last_interval_discovered: '2022-07-31T00:00:00Z',
        available_data: { account_numbers: [] },
      },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts customer_has_filled_credentials', async () => {
    const body = JSON.stringify({
      event: 'customer_has_filled_credentials',
      object: { id: 12345, utility: 'con_edison', has_filled_credentials: true },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('shared con_edison credentials'));
  });

  it('accepts new_unparsed_bill without logging the pre-signed file_url', async () => {
    const body = JSON.stringify({
      event: 'new_unparsed_bill',
      object: { id: 12345, status: 'unparsed', customer_id: 12345, utility: 'con_edison', file_url: 'https://x/y.pdf?X-Amz-Signature=abc' },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('X-Amz'));
  });

  it('accepts customer_must_reauthenticate', async () => {
    const body = JSON.stringify({
      event: 'customer_must_reauthenticate',
      object: { id: 12345, reason: 'mfa_factor_has_expired', onboarding_token: 'secret-token' },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('mfa_factor_has_expired'));
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('secret-token'));
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify({ event: 'something_new', object: {} });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('verifies the raw bytes whatever the content type', async () => {
    const body = '{ "event" :"bills_ready",\n "object":{"id":1} }';
    const res = await post(body, { ...signedHeaders(body), 'content-type': 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches (rotation)', async () => {
    const body = JSON.stringify(bill('new_bill'));
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const body = JSON.stringify(bill('new_bill'));
    const res = await post(body, signedHeaders(body, { prefix: 'svix' }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for a retried delivery with the same webhook-id', async () => {
    const body = JSON.stringify(bill('new_bill'));
    const id = `wh_retry_${Date.now()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(bill('new_bill'));
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(bill('new_bill'));
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with another secret', async () => {
    const other = 'whsec_' + Buffer.from('another-company-secret-01234567').toString('base64');
    const body = JSON.stringify(bill('new_bill'));
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects an unknown signature version', async () => {
    const body = JSON.stringify(bill('new_bill'));
    const headers = signedHeaders(body);
    headers['webhook-signature'] = headers['webhook-signature'].replace(/^v1,/, 'v2,');
    const res = await post(body, headers);
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(bill('new_bill'));
    const headers = signedHeaders(body);
    const res = await post(body.replace('12000', '1'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute window', async () => {
    const body = JSON.stringify(bill('new_bill'));
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric timestamp', async () => {
    const body = JSON.stringify(bill('new_bill'));
    const res = await post(body, signedHeaders(body, { timestamp: 'yesterday' }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when BAYOU_ENERGY_WEBHOOK_SECRET is not set', async () => {
    delete process.env.BAYOU_ENERGY_WEBHOOK_SECRET;
    const body = JSON.stringify(bill('new_bill'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
