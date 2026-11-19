// Generated with: klarna-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/klarna/route';
import { verifyKlarnaSignature } from '../lib/verify-klarna';

const SECRET = 'klarna_synthetic_signing_key_8a4f2c';
const BODY = '{"metadata":{"event_id":"b0e715e0-2ebd-462f-80f6-1366b4f90001","event_type":"payment.request.state-change.completed","event_version":"v2","occurred_at":"2026-11-18T10:15:00.000Z","product_instance_id":"krn:partner:product:test:5cadd30a-0000-4000-8000-000000000001","webhook_id":"krn:partner:global:notification:webhook:bc266feb-0000-4000-8000-000000000001","live":false},"payload":{"payment_request_id":"krn:payment:eu1:request:552603c0-0000-4000-8000-000000000001"}}';
const BODY2 = '{"metadata":{"event_id":"b0e715e0-2ebd-462f-80f6-1366b4f90002","event_type":"payment.request.state-change.expired","event_version":"v2","occurred_at":"2026-11-18T10:20:00.000Z","webhook_id":"krn:partner:global:notification:webhook:bc266feb-0000-4000-8000-000000000001","live":false},"payload":{"payment_request_id":"krn:payment:eu1:request:552603c0-0000-4000-8000-000000000002"}}';

const sign = (body: string, key: string | Buffer = SECRET) =>
  '' + crypto.createHmac('sha256', key).update(body).digest('hex');

const post = (body: string, signature?: string, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/webhooks/klarna', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
        ...(signature === undefined ? {} : { 'klarna-signature': signature }),
      },
      body,
    })
  );

beforeEach(() => {
  process.env.KLARNA_SIGNING_KEY = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyKlarnaSignature', () => {
  it('accepts hex and rejects base64', () => {
    expect(verifyKlarnaSignature(BODY, sign(BODY), SECRET)).toBe(true);
    const other = '' + crypto.createHmac('sha256', SECRET).update(BODY).digest('base64');
    expect(verifyKlarnaSignature(BODY, other, SECRET)).toBe(false);
  });

});

describe('/webhooks/klarna', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event_type: 'payment.request.state-change.completed', event_id: 'b0e715e0-2ebd-462f-80f6-1366b4f90001' });
  });

  it('rejects another secret, a tampered body and a missing signature header', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
    expect((await post(BODY.replace('state-change.completed', 'state-change.declined'), sign(BODY))).status).toBe(401);
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.KLARNA_SIGNING_KEY = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when KLARNA_SIGNING_KEY is not set', async () => {
    delete process.env.KLARNA_SIGNING_KEY;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
