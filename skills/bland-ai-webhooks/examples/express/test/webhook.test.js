// Generated with: bland-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'test_bland_webhook_signing_secret';
process.env.BLAND_WEBHOOK_SECRET = SECRET;

const { app, verifyBlandSignature } = require('../src/index');

/** Sign exactly like Bland: hex HMAC-SHA256 of the body. */
function sign(rawBody, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

function post(rawBody, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/bland-ai')
    .set('content-type', contentType)
    .set(headers)
    .send(rawBody);
}

function postSigned(payload, opts = {}) {
  const rawBody = JSON.stringify(payload);
  return post(rawBody, { 'x-webhook-signature': sign(rawBody, opts.secret) }, opts.contentType);
}

const callId = () => crypto.randomUUID();

const postCall = (extra = {}) => ({
  call_id: callId(),
  c_id: callId(),
  call_length: 0.18,
  to: '+15551234567',
  from: '+15559876543',
  completed: true,
  inbound: false,
  queue_status: 'complete',
  status: 'completed',
  error_message: null,
  concatenated_transcript: 'user: Hello? \n assistant: This is a test call from Bland. \n',
  transcripts: [
    { id: 1, user: 'user', text: 'Hello? ', created_at: '2025-09-12T20:39:13.173+00:00' },
    { id: 2, user: 'assistant', text: 'This is a test call from Bland.', created_at: '2025-09-12T20:39:13.566+00:00' },
  ],
  ...extra,
});

describe('Bland AI webhook', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  test('accepts a validly signed post-call payload', async () => {
    const res = await postSigned(postCall());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('accepts any content type because the body is read raw', async () => {
    for (const ct of ['text/plain', 'application/octet-stream', 'application/json; charset=utf-8']) {
      const res = await postSigned(postCall(), { contentType: ct });
      expect(res.status).toBe(200);
    }
  });

  test('handles a failed call (error_message in the payload)', async () => {
    const res = await postSigned(
      postCall({ status: 'failed', completed: false, error_message: 'Call failed. The number you dialed is busy. Please try again later.' })
    );
    expect(res.status).toBe(200);
  });

  test.each([
    ['citations', { event_type: 'citations', citations: [{ variable_name: 'firstName', value: 'James' }] }],
    ['post_transfer_transcript', { event_type: 'post_transfer_transcript', post_transfer_transcript: [] }],
    ['evals', { event_type: 'evals' }],
    ['multiple', { event_type: 'multiple', contents: ['citations', 'post_transfer_transcript'] }],
  ])('handles %s enrichment payloads', async (_name, extra) => {
    const res = await postSigned(postCall(extra));
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBeUndefined();
  });

  test('handles SMS conversation payloads', async () => {
    const res = await postSigned({ conversation_id: callId(), channel: 'sms', message: 'hi', sender: 'USER' });
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header', async () => {
    const res = await post(JSON.stringify(postCall()));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing/);
  });

  test('rejects a signature made with the wrong secret', async () => {
    const res = await postSigned(postCall(), { secret: 'some_other_secret' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a tampered body', async () => {
    const original = JSON.stringify(postCall());
    const res = await post(original.replace('completed', 'failed'), { 'x-webhook-signature': sign(original) });
    expect(res.status).toBe(400);
  });

  test('rejects a signature of the wrong length without throwing', async () => {
    const res = await post(JSON.stringify(postCall()), { 'x-webhook-signature': 'abc123' });
    expect(res.status).toBe(400);
  });

  test('rejects a validly signed body that is not JSON', async () => {
    const raw = 'not json';
    const res = await post(raw, { 'x-webhook-signature': sign(raw) }, 'text/plain');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('treats a redelivered call as a duplicate', async () => {
    const payload = postCall();
    expect((await postSigned(payload)).body).toEqual({ received: true });
    const second = await postSigned(payload);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });

  test('does not dedupe a citations webhook against the post-call webhook for the same call', async () => {
    const id = callId();
    await postSigned(postCall({ call_id: id }));
    const res = await postSigned(postCall({ call_id: id, event_type: 'citations', citations: [] }));
    expect(res.body.duplicate).toBeUndefined();
  });

  test('fails closed when no secret is configured', async () => {
    delete process.env.BLAND_WEBHOOK_SECRET;
    try {
      const res = await postSigned(postCall());
      expect(res.status).toBe(500);
    } finally {
      process.env.BLAND_WEBHOOK_SECRET = SECRET;
    }
  });
});

describe('verifyBlandSignature', () => {
  test('matches the algorithm in Bland docs (hex HMAC-SHA256)', () => {
    const body = '{"call_id":"abc"}';
    expect(verifyBlandSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyBlandSignature(body, sign(body).toUpperCase(), SECRET)).toBe(true);
    expect(verifyBlandSignature(body, sign(body, 'x'), SECRET)).toBe(false);
    expect(verifyBlandSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyBlandSignature(body, sign(body), '')).toBe(false);
  });
});
