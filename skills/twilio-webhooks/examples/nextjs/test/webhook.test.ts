import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.TWILIO_AUTH_TOKEN = 'test_auth_token_for_unit_tests';
  process.env.WEBHOOK_BASE_URL = 'https://example.com';
});

const AUTH_TOKEN = 'test_auth_token_for_unit_tests';
const WEBHOOK_URL = 'https://example.com/webhooks/twilio';

/**
 * Generate a valid Twilio signature for a form-encoded webhook.
 * Matches the algorithm implemented in route.ts (and the Twilio SDKs).
 */
function generateTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  return crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');
}

// Import the route handler after env vars are set
async function loadRoute() {
  const mod = await import('../app/webhooks/twilio/route');
  return mod;
}

function buildFormBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

function buildRequest(params: Record<string, string>, opts: { signature?: string | null } = {}) {
  const signature =
    opts.signature !== undefined ? opts.signature : generateTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, params);

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Host: 'example.com',
    'X-Forwarded-Proto': 'https',
  };
  if (signature !== null) headers['X-Twilio-Signature'] = signature;

  return new Request(WEBHOOK_URL, {
    method: 'POST',
    headers,
    body: buildFormBody(params),
  });
}

describe('verifyTwilioSignature (unit)', () => {
  it('returns true for a valid signature', async () => {
    const { verifyTwilioSignature } = await loadRoute();
    const params = { MessageSid: 'SM123', From: '+14155552671', Body: 'hello' };
    const signature = generateTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, params);

    expect(verifyTwilioSignature(AUTH_TOKEN, signature, WEBHOOK_URL, params)).toBe(true);
  });

  it('returns false for an invalid signature', async () => {
    const { verifyTwilioSignature } = await loadRoute();
    expect(verifyTwilioSignature(AUTH_TOKEN, 'not-real', WEBHOOK_URL, { Body: 'x' })).toBe(false);
  });

  it('returns false when signature is empty', async () => {
    const { verifyTwilioSignature } = await loadRoute();
    expect(verifyTwilioSignature(AUTH_TOKEN, '', WEBHOOK_URL, {})).toBe(false);
  });

  it('returns false for a tampered payload', async () => {
    const { verifyTwilioSignature } = await loadRoute();
    const original = { Body: 'hello' };
    const tampered = { Body: 'goodbye' };
    const signature = generateTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, original);

    expect(verifyTwilioSignature(AUTH_TOKEN, signature, WEBHOOK_URL, tampered)).toBe(false);
  });

  it('returns false for a wrong auth token', async () => {
    const { verifyTwilioSignature } = await loadRoute();
    const params = { Body: 'hello' };
    const signature = generateTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, params);

    expect(verifyTwilioSignature('wrong-token', signature, WEBHOOK_URL, params)).toBe(false);
  });

  it('generates a base64-encoded signature', () => {
    const sig = generateTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, { Body: 'hi' });
    expect(sig).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe('POST /webhooks/twilio', () => {
  it('returns 403 when X-Twilio-Signature is missing', async () => {
    const { POST } = await loadRoute();
    const req = buildRequest({ MessageSid: 'SM1', Body: 'hi' }, { signature: null });
    const res = await POST(req as any);
    expect(res.status).toBe(403);
  });

  it('returns 403 for an invalid signature', async () => {
    const { POST } = await loadRoute();
    const req = buildRequest({ MessageSid: 'SM1', Body: 'hi' }, { signature: 'invalid' });
    const res = await POST(req as any);
    expect(res.status).toBe(403);
  });

  it('returns 200 + TwiML for an incoming SMS with a valid signature', async () => {
    const { POST } = await loadRoute();
    const params = {
      MessageSid: 'SM' + 'a'.repeat(32),
      AccountSid: 'AC' + 'a'.repeat(32),
      From: '+14155552671',
      To: '+14155552672',
      Body: 'Hello!',
      NumMedia: '0',
    };
    const res = await POST(buildRequest(params) as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/xml/);
    const text = await res.text();
    expect(text).toContain('<Response>');
    expect(text).toContain('<Message>');
  });

  it('returns 204 for a message status callback', async () => {
    const { POST } = await loadRoute();
    const params = {
      MessageSid: 'SM' + 'b'.repeat(32),
      MessageStatus: 'delivered',
      AccountSid: 'AC' + 'a'.repeat(32),
    };
    const res = await POST(buildRequest(params) as any);
    expect(res.status).toBe(204);
  });

  it('handles every documented MessageStatus value', async () => {
    const { POST } = await loadRoute();
    const statuses = ['queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed'];
    for (const status of statuses) {
      const params = { MessageSid: 'SM' + 'c'.repeat(32), MessageStatus: status };
      const res = await POST(buildRequest(params) as any);
      expect(res.status).toBe(204);
    }
  });

  it('returns 200 + TwiML for an incoming voice call', async () => {
    const { POST } = await loadRoute();
    const params = {
      CallSid: 'CA' + 'd'.repeat(32),
      From: '+14155552671',
      To: '+14155552672',
      CallStatus: 'ringing',
      Direction: 'inbound',
    };
    const res = await POST(buildRequest(params) as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/xml/);
    const text = await res.text();
    expect(text).toContain('<Say>');
  });

  it('returns 204 for a call status callback', async () => {
    const { POST } = await loadRoute();
    const params = {
      CallSid: 'CA' + 'e'.repeat(32),
      CallStatus: 'completed',
      Direction: 'outbound-api',
    };
    const res = await POST(buildRequest(params) as any);
    expect(res.status).toBe(204);
  });

  it('handles every documented CallStatus value', async () => {
    const { POST } = await loadRoute();
    const statuses = ['queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled'];
    for (const status of statuses) {
      const params = {
        CallSid: 'CA' + 'f'.repeat(32),
        CallStatus: status,
        Direction: 'outbound-api',
      };
      const res = await POST(buildRequest(params) as any);
      expect(res.status).toBe(204);
    }
  });

  it('returns 204 for a recording status callback', async () => {
    const { POST } = await loadRoute();
    const params = {
      RecordingSid: 'RE' + 'g'.repeat(32),
      RecordingStatus: 'completed',
      RecordingUrl: 'https://api.twilio.com/recordings/REabc',
      CallSid: 'CA' + 'h'.repeat(32),
    };
    const res = await POST(buildRequest(params) as any);
    expect(res.status).toBe(204);
  });
});
