import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Affonso signing secrets are 64-character hex strings, used as plain string keys
const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.AFFONSO_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/affonso/route'));
});

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  delete process.env.AFFONSO_WEBHOOK_TOLERANCE_SECONDS;
  process.env.AFFONSO_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const now = () => Math.floor(Date.now() / 1000);

// Matches Affonso: lowercase hex HMAC-SHA256 of "<timestamp>.<raw body>", no prefix
function sign(body: string, timestamp: number | string, secret: string | Buffer = SECRET): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function signed(
  body: string,
  { timestamp = now(), secret = SECRET }: { timestamp?: number | string; secret?: string } = {}
): Record<string, string> {
  return {
    'x-affonso-timestamp': String(timestamp),
    'x-affonso-signature': sign(body, timestamp, secret),
  };
}

// Payloads follow the samples in Affonso's event docs
const DATA: Record<string, object> = {
  affiliate: {
    affiliateId: 'aff_xyz789', affiliateProgramId: 'prog_abc123', trackingId: 'john-doe', status: 'ACTIVE',
    email: 'john@example.com', name: 'John Doe', externalUserId: 'user_123', metadata: { plan: 'pro' }, groupId: 'grp_abc123',
  },
  referral: {
    referralId: 'ref_xyz789', affiliateId: 'aff_abc123', affiliateProgramId: 'prog_def456', trackingId: 'john-doe',
    status: 'CUSTOMER', email: 'customer@example.com', customerId: 'cus_stripe123', ip: '192.168.1.1',
    referrer: 'https://blog.example.com/review',
  },
  transaction: {
    transactionId: 'txn_xyz789', referralId: 'ref_abc123', affiliateId: 'aff_def456', saleAmount: 99.0, saleCurrency: 'USD',
    saleStatus: 'COMPLETE', commissionAmount: 29.7, commissionCurrency: 'USD', commissionStatus: 'PENDING',
    incentiveType: 'COMMISSION', holdPeriodDays: 30, invoiceId: null,
    createdAt: '2024-01-15T10:30:00.000Z', updatedAt: '2024-01-15T10:30:00.000Z',
  },
  payout: {
    payoutId: 'pay_xyz789', affiliateId: 'aff_abc123', affiliateProgramId: 'prog_def456', invoiceNumber: 1042, amount: 250.0,
    status: 'COMPLETED', isManagedPayout: true, paidAt: '2024-01-15T14:00:00.000Z',
    createdAt: '2024-01-15T10:30:00.000Z', updatedAt: '2024-01-15T14:00:00.000Z',
  },
};

function event(type: string): string {
  return JSON.stringify({
    id: 'evt_abc123',
    type,
    createdAt: '2024-01-15T10:30:00.000Z',
    data: DATA[type.split('.')[0]] ?? {},
  });
}

function post(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/affonso', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body,
    })
  );
}

describe('Affonso webhook signature verification', () => {
  it('accepts a valid signature', async () => {
    const body = event('transaction.created');
    const res = await post(body, signed(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an uppercase hex digest (compared case-insensitively)', async () => {
    const body = event('transaction.created');
    const h = signed(body);
    h['x-affonso-signature'] = h['x-affonso-signature'].toUpperCase();
    expect((await post(body, h)).status).toBe(200);
  });

  it('verifies the exact bytes, not a re-serialised body', async () => {
    const body = JSON.stringify(JSON.parse(event('payout.paid')), null, 4) + '\n';
    expect((await post(body, signed(body))).status).toBe(200);
  });

  it('accepts any content type', async () => {
    const body = event('referral.lead');
    expect((await post(body, signed(body), 'text/plain')).status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = event('transaction.paid');
    expect((await post(body, signed(body, { secret: 'f'.repeat(64) }))).status).toBe(401);
  });

  it('rejects a signature made with the hex-decoded secret', async () => {
    const body = event('transaction.paid');
    const ts = now();
    const sig = sign(body, ts, Buffer.from(SECRET, 'hex'));
    const res = await post(body, { 'x-affonso-timestamp': String(ts), 'x-affonso-signature': sig });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await post(event('transaction.paid'), signed(event('transaction.created')));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered timestamp', async () => {
    const body = event('transaction.created');
    const h = signed(body);
    h['x-affonso-timestamp'] = String(now() + 1);
    expect((await post(body, h)).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(event('transaction.created'), { 'x-affonso-timestamp': String(now()) });
    expect(res.status).toBe(401);
  });

  it('rejects a missing timestamp header', async () => {
    const body = event('transaction.created');
    const res = await post(body, { 'x-affonso-signature': signed(body)['x-affonso-signature'] });
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    const res = await post(event('transaction.created'), {
      'x-affonso-timestamp': String(now()),
      'x-affonso-signature': '',
    });
    expect(res.status).toBe(401);
  });

  it.each([
    ['garbage', 'garbage'],
    ['too short', 'ab'.repeat(31)],
    ['too long', 'ab'.repeat(33)],
    ['non-hex characters', 'zz'.repeat(32)],
    ['sha256= prefix', 'sha256=' + 'ab'.repeat(32)],
    ['a list of digests', ['ab'.repeat(32), 'cd'.repeat(32)].join(',')],
  ])('rejects a malformed signature (%s) without throwing', async (_name, sig) => {
    const res = await post(event('transaction.created'), {
      'x-affonso-timestamp': String(now()),
      'x-affonso-signature': sig,
    });
    expect(res.status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.AFFONSO_WEBHOOK_SECRET;
    const body = event('transaction.created');
    expect((await post(body, signed(body))).status).toBe(500);
  });
});

describe('Affonso timestamp tolerance (opt-in)', () => {
  const old = now() - 3600;

  it('is off by default: an hour-old timestamp with a valid signature is accepted', async () => {
    const body = event('transaction.created');
    expect((await post(body, signed(body, { timestamp: old }))).status).toBe(200);
  });

  it('rejects old timestamps when AFFONSO_WEBHOOK_TOLERANCE_SECONDS is positive', async () => {
    process.env.AFFONSO_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = event('transaction.created');
    expect((await post(body, signed(body, { timestamp: old }))).status).toBe(401);
  });

  it('accepts fresh timestamps when the tolerance is set', async () => {
    process.env.AFFONSO_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = event('transaction.created');
    expect((await post(body, signed(body))).status).toBe(200);
  });

  it('rejects a non-numeric timestamp when the tolerance is set', async () => {
    process.env.AFFONSO_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = event('transaction.created');
    expect((await post(body, signed(body, { timestamp: 'yesterday' }))).status).toBe(401);
  });

  it('treats a non-numeric tolerance as off', async () => {
    process.env.AFFONSO_WEBHOOK_TOLERANCE_SECONDS = 'five minutes';
    const body = event('transaction.created');
    expect((await post(body, signed(body, { timestamp: old }))).status).toBe(200);
  });

  it('treats 0 as off', async () => {
    process.env.AFFONSO_WEBHOOK_TOLERANCE_SECONDS = '0';
    const body = event('transaction.created');
    expect((await post(body, signed(body, { timestamp: old }))).status).toBe(200);
  });
});

describe('Affonso event handling', () => {
  it.each([
    'affiliate.created', 'affiliate.confirmed', 'referral.lead', 'referral.converted',
    'transaction.created', 'transaction.approved', 'transaction.paid', 'transaction.rejected',
    'payout.paid', 'payout.failed',
  ])('handles %s', async (type) => {
    const body = event(type);
    const res = await post(body, signed(body));
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  it('acknowledges unhandled events', async () => {
    const body = event('coupon.created');
    expect((await post(body, signed(body))).status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event: coupon.created');
  });

  it('rejects a validly signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, signed(body))).status).toBe(400);
  });
});
