// Generated with: marqeta-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/marqeta/route';
import { verifyBasicAuth, verifyMarqetaSignature } from '../lib/verify-marqeta';

const USERNAME = 'marqeta_webhook';
const PASSWORD = 'Synthetic_Pass-2026:abcXYZ!';
const SECRET = 'Synthetic_Secret-2026_abcXYZ#';
const TXNS = '{"transactions":[{"type":"authorization","state":"PENDING","token":"synthetic-txn-0001","user_token":"synthetic-user-01","card_token":"synthetic-card-01","amount":10.00,"currency_code":"USD","created_time":"2026-11-18T10:15:00Z"},{"type":"authorization.clearing","state":"COMPLETION","token":"synthetic-txn-0002","user_token":"synthetic-user-01","card_token":"synthetic-card-01","amount":10.00,"currency_code":"USD","created_time":"2026-11-18T10:16:00Z"}]}';
const PING = '{"pings":[{"token":"marqeta","payload":"healthcheck"}]}';

const basic = (username = USERNAME, password = PASSWORD) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
const sign = (body: string, algorithm = 'sha256') => crypto.createHmac(algorithm, SECRET).update(body).digest('hex');

const post = (body: string, authorization?: string, signature?: string) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authorization !== undefined) headers.authorization = authorization;
  if (signature !== undefined) headers['x-marqeta-signature'] = signature;
  return POST(new Request('http://localhost/webhooks/marqeta', { method: 'POST', headers, body }));
};

beforeEach(() => {
  process.env.MARQETA_WEBHOOK_USERNAME = USERNAME;
  process.env.MARQETA_WEBHOOK_PASSWORD = PASSWORD;
  delete process.env.MARQETA_WEBHOOK_SECRET;
  delete process.env.MARQETA_SIGNATURE_ALGORITHM;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verification helpers', () => {
  it('checks Basic auth and the hex HMAC', () => {
    expect(verifyBasicAuth(basic(), USERNAME, PASSWORD)).toBe(true);
    expect(verifyBasicAuth(`Bearer ${PASSWORD}`, USERNAME, PASSWORD)).toBe(false);
    expect(verifyMarqetaSignature(TXNS, sign(TXNS), SECRET)).toBe(true);
    expect(verifyMarqetaSignature(TXNS, sign(TXNS, 'sha1'), SECRET, ['sha1'])).toBe(true);
    expect(verifyMarqetaSignature(TXNS, sign(TXNS, 'sha1'), SECRET)).toBe(false);
  });
});

describe('POST /webhooks/marqeta', () => {
  it('accepts valid credentials and counts the batched notifications', async () => {
    const res = await post(TXNS, basic());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, counts: { transactions: 2 } });
  });

  it('answers the health-check ping', async () => {
    expect(await (await post(PING, basic())).json()).toEqual({ received: true, ping: true });
  });

  it('rejects wrong or missing credentials', async () => {
    expect((await post(TXNS, basic(USERNAME, 'Wrong_Pass-2026_abcXYZ!'))).status).toBe(401);
    expect((await post(TXNS)).status).toBe(401);
  });

  it('checks X-Marqeta-Signature when MARQETA_WEBHOOK_SECRET is set', async () => {
    process.env.MARQETA_WEBHOOK_SECRET = SECRET;
    expect((await post(TXNS, basic(), sign(TXNS))).status).toBe(200);
    expect((await post(TXNS, basic())).status).toBe(401);
  });

  it('returns 400 for invalid JSON with valid credentials', async () => {
    expect((await post('{"truncated": ', basic())).status).toBe(400);
  });

  it('returns 500 when the credentials are not set', async () => {
    delete process.env.MARQETA_WEBHOOK_PASSWORD;
    expect((await post(TXNS, basic())).status).toBe(500);
  });
});
