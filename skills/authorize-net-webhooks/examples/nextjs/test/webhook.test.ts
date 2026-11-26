// Generated with: authorize-net-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/authorize-net/route';
import { verifyAuthorizeNetSignature } from '../lib/verify-authorize-net';

const SECRET = '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF';
const BODY = '{"notificationId":"9b3c7e10-5f2a-4c1d-8e6b-0a1b2c3d4e5f","eventType":"net.authorize.payment.authcapture.created","eventDate":"2026-11-18T10:15:00.0000000Z","webhookId":"5e6f7a8b-1c2d-4e3f-9a0b-c1d2e3f4a5b6","payload":{"responseCode":1,"merchantReferenceId":"SYNTH-ORDER-0001","authCode":"LZ6I19","avsResponse":"Y","authAmount":45.00,"entityName":"transaction","id":"60020981676"}}';
const BODY2 = '{"notificationId":"1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9","eventType":"net.authorize.customer.created","eventDate":"2026-11-18T10:16:00.0000000Z","webhookId":"5e6f7a8b-1c2d-4e3f-9a0b-c1d2e3f4a5b6","payload":{"paymentProfiles":[{"id":"694","customerType":"individual"}],"merchantCustomerId":"cust457","entityName":"customerProfile","id":"394"}}';

const sign = (body: string, key: string | Buffer = SECRET) =>
  'sha512=' + crypto.createHmac('sha512', key).update(body).digest('hex').toUpperCase();

const post = (body: string, signature?: string, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/webhooks/authorize-net', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
        ...(signature === undefined ? {} : { 'x-anet-signature': signature }),
      },
      body,
    })
  );

beforeEach(() => {
  process.env.AUTHORIZE_NET_SIGNATURE_KEY = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyAuthorizeNetSignature', () => {
  it('accepts hex and rejects base64', () => {
    expect(verifyAuthorizeNetSignature(BODY, sign(BODY), SECRET)).toBe(true);
    const other = 'sha512=' + crypto.createHmac('sha512', SECRET).update(BODY).digest('base64');
    expect(verifyAuthorizeNetSignature(BODY, other, SECRET)).toBe(false);
  });

  it('rejects a digest keyed with the hex-decoded Signature Key: the key is used as text', () => {
    const decoded = 'sha512=' + crypto.createHmac('sha512', Buffer.from(SECRET, 'hex')).update(BODY).digest('hex').toUpperCase();
    expect(verifyAuthorizeNetSignature(BODY, decoded, SECRET)).toBe(false);
  });

  it('accepts lowercase hex', () => {
    const hex = crypto.createHmac('sha512', SECRET).update(BODY).digest('hex');
    expect(verifyAuthorizeNetSignature(BODY, 'sha512=' + hex, SECRET)).toBe(true);
  });
});

describe('/webhooks/authorize-net', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event_type: 'net.authorize.payment.authcapture.created', event_id: '9b3c7e10-5f2a-4c1d-8e6b-0a1b2c3d4e5f' });
  });

  it('rejects another secret, a tampered body and a missing signature header', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
    expect((await post(BODY.replace('"authAmount":45.00', '"authAmount":4500.00'), sign(BODY))).status).toBe(401);
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.AUTHORIZE_NET_SIGNATURE_KEY = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when AUTHORIZE_NET_SIGNATURE_KEY is not set', async () => {
    delete process.env.AUTHORIZE_NET_SIGNATURE_KEY;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
