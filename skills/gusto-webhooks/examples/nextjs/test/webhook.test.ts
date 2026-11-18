// Generated with: gusto-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/gusto/route';
import { verifyGustoSignature } from '../lib/verify-gusto';

const TOKEN = 'gusto_synthetic_verification_token_9d3f'; // synthetic
const BODY = '{"uuid":"f7397a24-57ad-4fae-b011-d258e8232900","event_type":"payroll.paid","resource_type":"Company","resource_uuid":"5df911a0-e8e9-412d-8aaf-a46ad193dd96","entity_type":"Payroll","entity_uuid":"b50e611d-8f3d-4f24-b001-46675f7b5777","timestamp":1795436100}';
const TOKEN_BODY = '{"verification_token":"gusto_synthetic_token_from_handshake"}';

const sign = (body: string, key = TOKEN) => crypto.createHmac('sha256', key).update(body).digest('hex');

const post = (body: string, signature?: string) =>
  POST(
    new Request('http://localhost/webhooks/gusto', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(signature === undefined ? {} : { 'x-gusto-signature': signature }) },
      body,
    })
  );

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  process.env.GUSTO_VERIFICATION_TOKEN = TOKEN;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const logged = () => logSpy.mock.calls.flat().join('\n');

describe('verifyGustoSignature', () => {
  it('accepts a bare hex digest and rejects the base64 form', () => {
    expect(verifyGustoSignature(BODY, sign(BODY), TOKEN)).toBe(true);
    const b64 = crypto.createHmac('sha256', TOKEN).update(BODY).digest('base64');
    expect(verifyGustoSignature(BODY, b64, TOKEN)).toBe(false);
  });
});

describe('POST /webhooks/gusto', () => {
  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event_type: 'payroll.paid', uuid: 'f7397a24-57ad-4fae-b011-d258e8232900' });
  });

  it('acknowledges the handshake before a token is configured, and shows the token', async () => {
    delete process.env.GUSTO_VERIFICATION_TOKEN;
    const res = await post(TOKEN_BODY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, verification_token_received: true });
    expect(logged()).toContain('gusto_synthetic_token_from_handshake');
  });

  it('acknowledges a re-sent token once configured, without logging it', async () => {
    expect((await post(TOKEN_BODY)).status).toBe(200);
    expect(logged()).not.toContain('gusto_synthetic_token_from_handshake');
  });

  it('rejects another token, a tampered body, a missing header and an unsigned event with a token field', async () => {
    expect((await post(BODY, sign(BODY, 'another_token'))).status).toBe(401);
    expect((await post(BODY.replace('payroll.paid', 'payroll.reversed'), sign(BODY))).status).toBe(401);
    expect((await post(BODY)).status).toBe(401);
    expect((await post('{"event_type":"payroll.paid","verification_token":"x"}')).status).toBe(401);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 for events when GUSTO_VERIFICATION_TOKEN is not set', async () => {
    delete process.env.GUSTO_VERIFICATION_TOKEN;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
