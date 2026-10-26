import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Khipu's merchant secret is an opaque string; this one is only for tests
const SECRET = 'test_khipu_merchant_secret_5f0c1a7e';

// Published test vector from Khipu's docs (exact bytes: string amounts, escaped slashes)
const VECTOR_SECRET = '1a4cbbbeb8bdb7e1d73572b9cc43ce4ce18f79d9';
const VECTOR_HEADER = 't=1711965600393,s=rq08YUGSaWa1D0RAwhMnJTRHMNmY4ToCn2Gd6G9LaDg=';
const VECTOR_BODY = String.raw`{"payment_id":"zfxnocsow6mz","receiver_id":990939,"subject":"TEST_COBRO","amount":"1000.0000","discount":"0.0000","currency":"CLP","receipt_url":"https:\/\/s3.amazonaws.com\/staging.notifications.khipu.com\/CPKH-1804240956-zfxnocsow6mz.pdf","bank":"DemoBank","bank_id":"Bawdf","payer_name":"Cobrador de desarrollo #990.939","payer_email":"test@khipu.com","personal_identifier":"44.444.444-4","bank_account_number":"000000000000444444444","out_of_date_conciliation":false,"transaction_id":"15f836bd-e8a7-4d12-b2f1-56403012b555","authorizer_operation_code":"AUT-20240418-0001","responsible_user_email":"test@khipu.com","payment_method":"simplified_transfer","conciliation_date":"2024-04-18T13:56:54.859Z"}`;

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.KHIPU_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/khipu/route'));
});

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  delete process.env.KHIPU_WEBHOOK_TOLERANCE_SECONDS;
  process.env.KHIPU_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const nowMs = () => Date.now();

// Matches Khipu: t=<unix ms>,s=<base64 HMAC-SHA256 of "<t>.<body>">
function sign(body: string, { timestamp = nowMs(), secret = SECRET }: { timestamp?: number; secret?: string } = {}) {
  const s = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64');
  return `t=${timestamp},s=${s}`;
}

// Payload as shown in Khipu's docs (reconciliation)
function payment(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    payment_id: 'zfxnocsow6mz',
    receiver_id: 990939,
    subject: 'TEST_COBRO',
    amount: 1000.0,
    discount: 0.0,
    currency: 'CLP',
    receipt_url: 'https://s3.amazonaws.com/staging.notifications.khipu.com/CPKH-1804240956-zfxnocsow6mz.pdf',
    bank: 'DemoBank',
    bank_id: 'Bawdf',
    payer_name: 'Developer User #990.939',
    payer_email: 'test@khipu.com',
    personal_identifier: '44.444.444-4',
    bank_account_number: '000000000000444444444',
    out_of_date_conciliation: false,
    transaction_id: '15f836bd-e8a7-4d12-b2f1-56403012b555',
    authorizer_operation_code: 'AUT-20240418-0001',
    responsible_user_email: 'test@khipu.com',
    payment_method: 'simplified_transfer',
    conciliation_date: '2024-04-18T13:56:54.859Z',
    ...overrides,
  });
}

function req(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/khipu', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('Khipu webhook', () => {
  describe('published test vector', () => {
    it('accepts the vendor documentation example', async () => {
      process.env.KHIPU_WEBHOOK_SECRET = VECTOR_SECRET;
      const res = await POST(req(VECTOR_BODY, { 'x-khipu-signature': VECTOR_HEADER }));
      expect(res.status).toBe(200);
    });

    it('rejects the vector with a re-serialised body', async () => {
      process.env.KHIPU_WEBHOOK_SECRET = VECTOR_SECRET;
      const reserialised = JSON.stringify(JSON.parse(VECTOR_BODY));
      const res = await POST(req(reserialised, { 'x-khipu-signature': VECTOR_HEADER }));
      expect(res.status).toBe(401);
    });
  });

  describe('signature verification', () => {
    it('accepts a valid signature and logs the payment', async () => {
      const body = payment();
      const res = await POST(req(body, { 'x-khipu-signature': sign(body) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Payment zfxnocsow6mz reconciled'));
    });

    it('verifies any content type', async () => {
      const body = payment();
      const res = await POST(req(body, { 'x-khipu-signature': sign(body) }, 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('rejects a missing header', async () => {
      const res = await POST(req(payment()));
      expect(res.status).toBe(401);
    });

    it('rejects an empty header', async () => {
      const res = await POST(req(payment(), { 'x-khipu-signature': '' }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong secret', async () => {
      const body = payment();
      const res = await POST(req(body, { 'x-khipu-signature': sign(body, { secret: 'other' }) }));
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const header = sign(payment());
      const res = await POST(req(payment({ amount: 1 }), { 'x-khipu-signature': header }));
      expect(res.status).toBe(401);
    });

    it('rejects a header without t', async () => {
      const body = payment();
      const s = sign(body).split(',s=')[1];
      const res = await POST(req(body, { 'x-khipu-signature': `s=${s}` }));
      expect(res.status).toBe(401);
    });

    it('rejects a header without s', async () => {
      const res = await POST(req(payment(), { 'x-khipu-signature': `t=${nowMs()}` }));
      expect(res.status).toBe(401);
    });

    it('rejects a signature that is not 44-char padded base64', async () => {
      const body = payment();
      const res = await POST(req(body, { 'x-khipu-signature': sign(body).replace(/=$/, '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a signature with stray low bits in the last character', async () => {
      // Same decoded bytes, different string: Hookdeck rejects it, so must we
      const body = payment();
      const header = sign(body);
      const [tPart, sig] = header.split(',s=');
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const idx = alphabet.indexOf(sig[42]);
      const twin = alphabet[(idx + 1) % 4 === 0 ? idx - 3 : idx + 1];
      const forgedSig = `${sig.slice(0, 42)}${twin}=`;
      expect(Buffer.from(forgedSig, 'base64').equals(Buffer.from(sig, 'base64'))).toBe(true);
      const res = await POST(req(body, { 'x-khipu-signature': `${tPart},s=${forgedSig}` }));
      expect(res.status).toBe(401);
    });

    it('accepts when any s= entry matches', async () => {
      const body = payment();
      const ts = nowMs();
      const good = sign(body, { timestamp: ts }).split(',s=')[1];
      const bad = sign(body, { timestamp: ts, secret: 'old' }).split(',s=')[1];
      const res = await POST(req(body, { 'x-khipu-signature': `t=${ts},s=${bad},s=${good}` }));
      expect(res.status).toBe(200);
    });

    it('ignores unknown keys', async () => {
      const body = payment();
      const res = await POST(req(body, { 'x-khipu-signature': `${sign(body)},v=2` }));
      expect(res.status).toBe(200);
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.KHIPU_WEBHOOK_SECRET;
      const body = payment();
      const res = await POST(req(body, { 'x-khipu-signature': sign(body) }));
      expect(res.status).toBe(500);
    });

    it('returns 400 for a signed body that is not JSON', async () => {
      const body = 'not json';
      const res = await POST(req(body, { 'x-khipu-signature': sign(body) }, 'text/plain'));
      expect(res.status).toBe(400);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const oneHourAgo = () => nowMs() - 3600 * 1000;

    it('accepts old timestamps by default', async () => {
      const body = payment();
      const res = await POST(req(body, { 'x-khipu-signature': sign(body, { timestamp: oneHourAgo() }) }));
      expect(res.status).toBe(200);
    });

    it('rejects old timestamps when a tolerance is set', async () => {
      process.env.KHIPU_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = payment();
      const res = await POST(req(body, { 'x-khipu-signature': sign(body, { timestamp: oneHourAgo() }) }));
      expect(res.status).toBe(401);
    });

    it('accepts fresh timestamps when a tolerance is set', async () => {
      process.env.KHIPU_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = payment();
      const res = await POST(req(body, { 'x-khipu-signature': sign(body) }));
      expect(res.status).toBe(200);
    });

    it('treats an invalid tolerance as off', async () => {
      process.env.KHIPU_WEBHOOK_TOLERANCE_SECONDS = 'abc';
      const body = payment();
      const res = await POST(req(body, { 'x-khipu-signature': sign(body, { timestamp: oneHourAgo() }) }));
      expect(res.status).toBe(200);
    });
  });
});
