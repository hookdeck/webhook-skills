import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const SECRET = 'ig_test_signing_secret_for_tests';

let POST: (request: NextRequest) => Promise<Response>;
let verifyInfiniteGivingWebhook: typeof import('../lib/verify').verifyInfiniteGivingWebhook;

beforeAll(async () => {
  process.env.INFINITE_GIVING_WEBHOOK_SECRET = SECRET;
  delete process.env.INFINITE_GIVING_WEBHOOK_TOLERANCE_SECONDS;
  ({ POST } = await import('../app/webhooks/infinite-giving/route'));
  ({ verifyInfiniteGivingWebhook } = await import('../lib/verify'));
});

afterEach(() => {
  delete process.env.INFINITE_GIVING_WEBHOOK_TOLERANCE_SECONDS;
});

// Payloads as shown in Infinite Giving's webhook docs
const donationCreated = {
  id: 'A1B2C3D4E',
  event: 'donation:created',
  created_at: '2026-06-23T21:00:00.000Z',
  data: {
    id: 'DON1234567',
    object: 'donation',
    organization: { id: 'ORGABCDEFG', name: 'Example Nonprofit' },
    type: 'stock',
    status: 'pledged',
    identifier: 'AAPL',
    quantity: 10,
    tax_deductible_amount: null,
    recognition: 'public',
    memo: null,
    source: 'Fidelity',
    cancelation_reason: null,
    campaign: { id: 'CAM1234567', name: 'Annual Fund' },
    designation: null,
    trade: null,
    donor: { first_name: 'Jane', last_name: 'Donor', email: 'jane@example.com' },
    created_at: '2026-06-23T21:00:00.000Z',
    updated_at: '2026-06-23T21:00:00.000Z',
  },
};

const donationUpdated = {
  id: 'F6G7H8I9J',
  event: 'donation:updated',
  created_at: '2026-06-24T14:30:00.000Z',
  data: {
    ...donationCreated.data,
    status: 'complete',
    tax_deductible_amount: 2143.5,
    trade: {
      executed_at: '2026-06-24T13:00:00.000Z',
      settled_at: '2026-06-24T14:00:00.000Z',
      fill_price: 215.0,
      fill_quantity: 10,
      sec_fee: 0.02,
      postedge_fee: 0,
      liquidity_fee: 0,
      orf_fee: 0,
      nasd_fee: 0,
      misc_fee: 0,
    },
    updated_at: '2026-06-24T14:30:00.000Z',
  },
};

// Sign exactly as Infinite Giving does: HMAC-SHA256 of `${timestamp}.${rawBody}`
function sign(body: string | Buffer, timestamp: string, secret = SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), Buffer.from(body)]))
    .digest('hex');
}

const nowTs = () => String(Math.floor(Date.now() / 1000));

function post(body: string, headers: Record<string, string>, contentType = 'application/json') {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/infinite-giving', {
      method: 'POST',
      headers: { 'Content-Type': contentType, ...headers },
      body,
    })
  );
}

function signedHeaders(body: string, timestamp = nowTs()): Record<string, string> {
  return { 'X-IG-Timestamp': timestamp, 'X-IG-Signature': `sha256=${sign(body, timestamp)}` };
}

describe('Infinite Giving webhook route', () => {
  it('accepts a donation:created event with a valid signature', async () => {
    const body = JSON.stringify(donationCreated);
    const res = await post(body, { ...signedHeaders(body), 'X-IG-Event': 'donation:created', 'X-IG-Webhook-Id': 'A1B2C3D4E' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a donation:updated event with a valid signature', async () => {
    const body = JSON.stringify(donationUpdated);
    expect((await post(body, signedHeaders(body))).status).toBe(200);
  });

  it('accepts the bare digest without the sha256= prefix', async () => {
    const body = JSON.stringify(donationCreated);
    const ts = nowTs();
    expect((await post(body, { 'X-IG-Timestamp': ts, 'X-IG-Signature': sign(body, ts) })).status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const body = JSON.stringify(donationCreated);
    const ts = nowTs();
    const res = await post(body, { 'X-IG-Timestamp': ts, 'X-IG-Signature': `sha256=${sign(body, ts).toUpperCase()}` });
    expect(res.status).toBe(200);
  });

  it('verifies the exact raw bytes (non-canonical JSON formatting)', async () => {
    const body = '{ "id" : "X1", "event" : "donation:created",\n  "data" : {"id":"DON1"} }\n';
    expect((await post(body, signedHeaders(body))).status).toBe(200);
  });

  it('works with any content type', async () => {
    const body = JSON.stringify(donationCreated);
    expect((await post(body, signedHeaders(body), 'application/vnd.api+json')).status).toBe(200);
  });

  it('accepts unknown events after verification', async () => {
    const body = JSON.stringify({ id: 'Z', event: 'donation:other', data: {} });
    expect((await post(body, signedHeaders(body))).status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    const body = JSON.stringify(donationCreated);
    expect((await post(body, { 'X-IG-Timestamp': nowTs() })).status).toBe(401);
  });

  it('rejects a missing timestamp', async () => {
    const body = JSON.stringify(donationCreated);
    expect((await post(body, { 'X-IG-Signature': `sha256=${sign(body, nowTs())}` })).status).toBe(401);
  });

  it('rejects empty signature and timestamp headers', async () => {
    const body = JSON.stringify(donationCreated);
    expect((await post(body, { 'X-IG-Timestamp': nowTs(), 'X-IG-Signature': '' })).status).toBe(401);
    expect((await post(body, { 'X-IG-Timestamp': '', 'X-IG-Signature': `sha256=${sign(body, '')}` })).status).toBe(401);
  });

  it('rejects malformed signatures', async () => {
    const body = JSON.stringify(donationCreated);
    const ts = nowTs();
    for (const bad of ['sha256=abc', 'sha256=' + 'z'.repeat(64), 'sha256=' + 'a'.repeat(63), 'sha256=' + 'a'.repeat(65), 'sha256=']) {
      expect((await post(body, { 'X-IG-Timestamp': ts, 'X-IG-Signature': bad })).status).toBe(401);
    }
  });

  it('rejects a signature that does not match', async () => {
    const body = JSON.stringify(donationCreated);
    const res = await post(body, { 'X-IG-Timestamp': nowTs(), 'X-IG-Signature': `sha256=${'0'.repeat(64)}` });
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(donationCreated);
    const ts = nowTs();
    const res = await post(body, { 'X-IG-Timestamp': ts, 'X-IG-Signature': `sha256=${sign(body, ts, 'wrong')}` });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(donationCreated);
    const headers = signedHeaders(body);
    expect((await post(body.replace('AAPL', 'MSFT'), headers)).status).toBe(401);
  });

  it('rejects a timestamp that differs from the signed one', async () => {
    const body = JSON.stringify(donationCreated);
    const ts = nowTs();
    const res = await post(body, { 'X-IG-Timestamp': String(Number(ts) + 1), 'X-IG-Signature': `sha256=${sign(body, ts)}` });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON that is correctly signed', async () => {
    const body = 'not json';
    expect((await post(body, signedHeaders(body))).status).toBe(400);
  });

  it('does not reject old timestamps by default', async () => {
    const body = JSON.stringify(donationCreated);
    expect((await post(body, signedHeaders(body, '1700000000'))).status).toBe(200);
  });

  it('rejects old timestamps when a tolerance is configured', async () => {
    process.env.INFINITE_GIVING_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = JSON.stringify(donationCreated);
    expect((await post(body, signedHeaders(body, '1700000000'))).status).toBe(401);
    expect((await post(body, signedHeaders(body))).status).toBe(200);
  });
});

describe('verifyInfiniteGivingWebhook', () => {
  it('uses the timestamp header as received (latin1 bytes)', () => {
    const body = Buffer.from('{"a":1}');
    const ts = '17000é';
    expect(verifyInfiniteGivingWebhook(body, ts, sign(body, ts), SECRET).valid).toBe(true);
  });

  it('verifies bodies that are not valid UTF-8', () => {
    const body = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
    const ts = nowTs();
    expect(verifyInfiniteGivingWebhook(body, ts, `sha256=${sign(body, ts)}`, SECRET).valid).toBe(true);
  });

  it('fails without a configured secret', () => {
    expect(verifyInfiniteGivingWebhook(Buffer.from('{}'), nowTs(), 'a'.repeat(64), '').valid).toBe(false);
  });
});
