// Generated with: bland-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'test_bland_webhook_signing_secret';

import { POST } from '../app/webhooks/bland-ai/route';
import { verifyBlandSignature } from '../lib/bland';

/** Sign exactly like Bland: hex HMAC-SHA256 of the body. */
function sign(rawBody: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

function req(rawBody: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return new Request('http://localhost:3000/webhooks/bland-ai', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body: rawBody,
  });
}

function signed(payload: unknown, opts: { secret?: string; contentType?: string } = {}) {
  const raw = JSON.stringify(payload);
  return req(raw, { 'x-webhook-signature': sign(raw, opts.secret) }, opts.contentType);
}

const callId = () => crypto.randomUUID();

const postCall = (extra: Record<string, unknown> = {}) => ({
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
  transcripts: [
    { id: 1, user: 'user', text: 'Hello? ', created_at: '2025-09-12T20:39:13.173+00:00' },
    { id: 2, user: 'assistant', text: 'This is a test call from Bland.', created_at: '2025-09-12T20:39:13.566+00:00' },
  ],
  ...extra,
});

describe('Bland AI webhook', () => {
  beforeEach(() => {
    process.env.BLAND_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a validly signed post-call payload', async () => {
    const res = await POST(signed(postCall()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts any content type because the body is read raw', async () => {
    for (const ct of ['text/plain', 'application/octet-stream', 'application/json; charset=utf-8']) {
      const res = await POST(signed(postCall(), { contentType: ct }));
      expect(res.status).toBe(200);
    }
  });

  it('handles a failed call (error_message in the payload)', async () => {
    const res = await POST(
      signed(postCall({ status: 'failed', completed: false, error_message: 'Call failed. The number you dialed is busy. Please try again later.' }))
    );
    expect(res.status).toBe(200);
  });

  it.each([
    ['citations', { event_type: 'citations', citations: [{ variable_name: 'firstName', value: 'James' }] }],
    ['post_transfer_transcript', { event_type: 'post_transfer_transcript', post_transfer_transcript: [] }],
    ['evals', { event_type: 'evals' }],
    ['multiple', { event_type: 'multiple', contents: ['citations', 'post_transfer_transcript'] }],
  ])('handles %s enrichment payloads', async (_name, extra) => {
    const res = await POST(signed(postCall(extra)));
    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBeUndefined();
  });

  it('handles SMS conversation payloads', async () => {
    const res = await POST(signed({ conversation_id: callId(), channel: 'sms', message: 'hi', sender: 'USER' }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(req(JSON.stringify(postCall())));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Missing/);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await POST(signed(postCall(), { secret: 'some_other_secret' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  it('rejects a tampered body', async () => {
    const original = JSON.stringify(postCall());
    const res = await POST(req(original.replace('completed', 'failed'), { 'x-webhook-signature': sign(original) }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature of the wrong length without throwing', async () => {
    const res = await POST(req(JSON.stringify(postCall()), { 'x-webhook-signature': 'abc123' }));
    expect(res.status).toBe(400);
  });

  it('rejects a validly signed body that is not JSON', async () => {
    const raw = 'not json';
    const res = await POST(req(raw, { 'x-webhook-signature': sign(raw) }, 'text/plain'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  it('treats a redelivered call as a duplicate', async () => {
    const payload = postCall();
    expect(await (await POST(signed(payload))).json()).toEqual({ received: true });
    const second = await POST(signed(payload));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });

  it('does not dedupe a citations webhook against the post-call webhook for the same call', async () => {
    const id = callId();
    await POST(signed(postCall({ call_id: id })));
    const res = await POST(signed(postCall({ call_id: id, event_type: 'citations', citations: [] })));
    expect((await res.json()).duplicate).toBeUndefined();
  });

  it('fails closed when no secret is configured', async () => {
    delete process.env.BLAND_WEBHOOK_SECRET;
    const res = await POST(signed(postCall()));
    expect(res.status).toBe(500);
  });
});

describe('verifyBlandSignature', () => {
  it('matches the algorithm in Bland docs (hex HMAC-SHA256)', () => {
    const body = '{"call_id":"abc"}';
    expect(verifyBlandSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyBlandSignature(body, sign(body).toUpperCase(), SECRET)).toBe(true);
    expect(verifyBlandSignature(body, sign(body, 'x'), SECRET)).toBe(false);
    expect(verifyBlandSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyBlandSignature(body, sign(body), '')).toBe(false);
  });
});
