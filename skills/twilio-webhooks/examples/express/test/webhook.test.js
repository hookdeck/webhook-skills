const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app
process.env.TWILIO_AUTH_TOKEN = 'test_auth_token_for_unit_tests';

const { app, verifyTwilioWebhook } = require('../src/index');

const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WEBHOOK_PATH = '/webhooks/twilio';

/**
 * Generate a valid Twilio X-Twilio-Signature for a form-encoded webhook.
 *
 * Algorithm (must match twilio.validateRequest):
 *   HMAC-SHA1(authToken, url + concat(sortedParamName + paramValue)) -> base64
 */
function generateTwilioSignature(authToken, url, params) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  return crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');
}

// supertest doesn't set the Host header to a stable value, so we use this
// constant when building the URL we sign — and override Host on the request.
const HOST = 'example.com';
const TEST_URL = `https://${HOST}${WEBHOOK_PATH}`;

function postWebhook(params, opts = {}) {
  const url = opts.url || TEST_URL;
  const signature = opts.signature !== undefined
    ? opts.signature
    : generateTwilioSignature(AUTH_TOKEN, url, params);

  // Build a form-encoded body matching what Express's urlencoded parser will produce
  const body = new URLSearchParams(params).toString();

  const req = request(app)
    .post(WEBHOOK_PATH)
    .set('Host', HOST)
    .set('X-Forwarded-Proto', 'https')
    .set('Content-Type', 'application/x-www-form-urlencoded')
    .send(body);

  if (signature !== null) {
    req.set('X-Twilio-Signature', signature);
  }
  return req;
}

describe('verifyTwilioWebhook (unit)', () => {
  it('returns true for a valid signature', () => {
    const params = { MessageSid: 'SM123', From: '+14155552671', Body: 'hello' };
    const signature = generateTwilioSignature(AUTH_TOKEN, TEST_URL, params);

    expect(verifyTwilioWebhook(AUTH_TOKEN, signature, TEST_URL, params)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const params = { MessageSid: 'SM123' };
    expect(verifyTwilioWebhook(AUTH_TOKEN, 'not-a-real-signature', TEST_URL, params)).toBe(false);
  });

  it('returns false when signature is missing', () => {
    expect(verifyTwilioWebhook(AUTH_TOKEN, undefined, TEST_URL, {})).toBe(false);
    expect(verifyTwilioWebhook(AUTH_TOKEN, '', TEST_URL, {})).toBe(false);
  });

  it('returns false for a tampered payload', () => {
    const original = { MessageSid: 'SM123', Body: 'hello' };
    const tampered = { MessageSid: 'SM123', Body: 'goodbye' };
    const signature = generateTwilioSignature(AUTH_TOKEN, TEST_URL, original);

    expect(verifyTwilioWebhook(AUTH_TOKEN, signature, TEST_URL, tampered)).toBe(false);
  });

  it('returns false for a wrong auth token', () => {
    const params = { MessageSid: 'SM123' };
    const signature = generateTwilioSignature(AUTH_TOKEN, TEST_URL, params);
    expect(verifyTwilioWebhook('wrong-token', signature, TEST_URL, params)).toBe(false);
  });
});

describe('POST /webhooks/twilio', () => {
  it('returns 403 when X-Twilio-Signature is missing', async () => {
    const res = await postWebhook(
      { MessageSid: 'SM123', From: '+14155552671', Body: 'hi' },
      { signature: null },
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 for an invalid signature', async () => {
    const res = await postWebhook(
      { MessageSid: 'SM123', From: '+14155552671', Body: 'hi' },
      { signature: 'invalid_signature_value' },
    );
    expect(res.status).toBe(403);
  });

  it('returns 200 + TwiML for an incoming SMS with a valid signature', async () => {
    const params = {
      MessageSid: 'SM' + 'a'.repeat(32),
      AccountSid: 'AC' + 'a'.repeat(32),
      From: '+14155552671',
      To: '+14155552672',
      Body: 'Hello!',
      NumMedia: '0',
    };
    const res = await postWebhook(params);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/xml/);
    expect(res.text).toContain('<Response>');
    expect(res.text).toContain('<Message>');
  });

  it('returns 204 for a message status callback', async () => {
    const params = {
      MessageSid: 'SM' + 'b'.repeat(32),
      MessageStatus: 'delivered',
      AccountSid: 'AC' + 'a'.repeat(32),
      From: '+14155552671',
      To: '+14155552672',
    };
    const res = await postWebhook(params);

    expect(res.status).toBe(204);
  });

  it('handles every documented MessageStatus value', async () => {
    const statuses = ['queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed'];
    for (const status of statuses) {
      const params = {
        MessageSid: 'SM' + 'c'.repeat(32),
        MessageStatus: status,
        ErrorCode: status === 'failed' || status === 'undelivered' ? '30003' : '',
      };
      const res = await postWebhook(params);
      expect(res.status).toBe(204);
    }
  });

  it('returns 200 + TwiML for an incoming voice call', async () => {
    const params = {
      CallSid: 'CA' + 'd'.repeat(32),
      AccountSid: 'AC' + 'a'.repeat(32),
      From: '+14155552671',
      To: '+14155552672',
      CallStatus: 'ringing',
      Direction: 'inbound',
    };
    const res = await postWebhook(params);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/xml/);
    expect(res.text).toContain('<Response>');
    expect(res.text).toContain('<Say>');
  });

  it('returns 204 for a call status callback', async () => {
    const params = {
      CallSid: 'CA' + 'e'.repeat(32),
      CallStatus: 'completed',
      Direction: 'outbound-api',
      From: '+14155552671',
      To: '+14155552672',
    };
    const res = await postWebhook(params);

    expect(res.status).toBe(204);
  });

  it('handles every documented CallStatus value on status callbacks', async () => {
    const statuses = ['queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled'];
    for (const status of statuses) {
      const params = {
        CallSid: 'CA' + 'f'.repeat(32),
        CallStatus: status,
        Direction: 'outbound-api',
      };
      const res = await postWebhook(params);
      expect(res.status).toBe(204);
    }
  });

  it('returns 204 for a recording status callback', async () => {
    const params = {
      RecordingSid: 'RE' + 'g'.repeat(32),
      RecordingStatus: 'completed',
      RecordingUrl: 'https://api.twilio.com/recordings/REabc',
      CallSid: 'CA' + 'h'.repeat(32),
    };
    const res = await postWebhook(params);

    expect(res.status).toBe(204);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
