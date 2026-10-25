// Generated with: envoy-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/envoy/route';
import { verifyEnvoySignature } from '../lib/verify';

// Envoy signs with your app's client secret.
const SECRET = 'test_envoy_client_secret';

// Same algorithm as Envoy: base64(HMAC-SHA256(client secret, raw body)).
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

function makePayload(event: string, type = 'entries', attributes: Record<string, unknown> = { 'full-name': 'John Doe' }) {
  return {
    event,
    meta: {
      location: { id: '94082', type: 'locations', attributes: { name: 'HQ' } },
      company: { id: '75254', type: 'companies', attributes: { name: 'Envoy' } },
    },
    payload: { id: '80078985', type, attributes },
  };
}

function makeRequest(body: string, signature?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-envoy-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/envoy', { method: 'POST', headers, body });
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('ENVOY_CLIENT_SECRET', SECRET);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Envoy webhook route', () => {
  test('accepts a valid signature for entry_sign_in', async () => {
    const body = JSON.stringify(makePayload('entry_sign_in'));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('entry_sign_in'));
  });

  test('verifies regardless of content type (raw body)', async () => {
    const body = JSON.stringify(makePayload('invite_created', 'invites'));
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  test('rejects an invalid signature', async () => {
    const body = JSON.stringify(makePayload('entry_sign_in'));
    const res = await POST(makeRequest(body, sign(body, 'wrong')));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a body modified after signing', async () => {
    const body = JSON.stringify(makePayload('entry_sign_in'));
    const res = await POST(makeRequest(body.replace('John Doe', 'Eve'), sign(body)));
    expect(res.status).toBe(400);
  });

  test('rejects a missing signature header', async () => {
    const body = JSON.stringify(makePayload('entry_sign_in'));
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Missing/);
  });

  test('rejects a hex-encoded signature (must be base64)', async () => {
    const body = JSON.stringify(makePayload('entry_sign_in'));
    const hex = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    const res = await POST(makeRequest(body, hex));
    expect(res.status).toBe(400);
  });

  test('returns 500 when the secret is not configured', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('ENVOY_CLIENT_SECRET', '');
    const body = JSON.stringify(makePayload('entry_sign_in'));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(500);
  });

  test('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  test.each([
    'entry_sign_in',
    'entry_sign_out',
    'entry_blacklist_review',
    'entry_blacklist_deny',
    'entry_manually_updated',
    'invite_created',
    'invite_updated',
    'invite_removed',
    'upcoming_visit',
    'qr_code_sent',
    'employee_invite_created',
    'employee_invite_updated',
    'employee_upcoming_visit',
    'employee_entry_sign_in',
    'employee_entry_sign_out',
    'employee_entry_blacklist_review',
    'employee_entry_blacklist_deny',
    'location_capacity_updated',
    'desk_sign_in',
    'ticket_created',
  ])('handles %s', async (event) => {
    const body = JSON.stringify(makePayload(event));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  test('acknowledges unknown events', async () => {
    const body = JSON.stringify(makePayload('something_new'));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled Envoy event: something_new'));
  });

  test('verifyEnvoySignature handles length mismatch and empty inputs', () => {
    expect(verifyEnvoySignature('{}', sign('{}'), SECRET)).toBe(true);
    expect(verifyEnvoySignature('{}', 'short', SECRET)).toBe(false);
    expect(verifyEnvoySignature('{}', '', SECRET)).toBe(false);
    expect(verifyEnvoySignature('{}', sign('{}'), '')).toBe(false);
  });
});
