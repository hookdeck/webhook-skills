// Generated with: bitgo-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/bitgo/route';
import { verifyBitGoSignature } from '../lib/verify-bitgo';

const SECRET = 'bitgo_synthetic_webhook_secret_5e2d';
const BODY = '{"type":"transfer","wallet":"62c5b5c9d0ece30007cec9616ff29edc","coin":"tbtc4","transfer":"68531ea4e3669330070c95e454f5b366","hash":"db924f4cf2347ac5a6b464d3e8dc4a20cffc117eb29f4460645fbc34de171bfb","state":"confirmed","simulation":true}';
const BODY2 = '{"type":"pendingapproval","wallet":"62c5b5c9d0ece30007cec9616ff29edc","coin":"tbtc4","pendingApprovalId":"6853262b9da229cea98569ce","state":"pending","simulation":true}';

const sign = (body: string, key: string | Buffer = SECRET) =>
  '' + crypto.createHmac('sha256', key).update(body).digest('hex');

const post = (body: string, signature?: string, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/webhooks/bitgo', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
        ...(signature === undefined ? {} : { 'x-signature-sha256': signature }),
      },
      body,
    })
  );

beforeEach(() => {
  process.env.BITGO_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyBitGoSignature', () => {
  it('accepts hex and rejects base64', () => {
    expect(verifyBitGoSignature(BODY, sign(BODY), SECRET)).toBe(true);
    const other = '' + crypto.createHmac('sha256', SECRET).update(BODY).digest('base64');
    expect(verifyBitGoSignature(BODY, other, SECRET)).toBe(false);
  });

});

describe('/webhooks/bitgo', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'transfer', wallet: '62c5b5c9d0ece30007cec9616ff29edc' });
  });

  it('rejects another secret, a tampered body and a missing signature header', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
    expect((await post(BODY.replace('"state":"confirmed"', '"state":"failed"'), sign(BODY))).status).toBe(401);
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.BITGO_WEBHOOK_SECRET = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when BITGO_WEBHOOK_SECRET is not set', async () => {
    delete process.env.BITGO_WEBHOOK_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
