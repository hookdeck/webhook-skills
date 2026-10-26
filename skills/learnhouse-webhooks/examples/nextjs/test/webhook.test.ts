import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/learnhouse/route';
import { verifyLearnhouseSignature } from '../lib/learnhouse';

// whsec_ secrets are used whole as a plain UTF-8 HMAC key (not Standard Webhooks)
const SECRET = 'whsec_test_secret_key_123';

beforeAll(() => {
  process.env.LEARNHOUSE_WEBHOOK_SECRET = SECRET;
});

function hmacHex(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}
const sign = (body: string, secret = SECRET) => 'sha256=' + hmacHex(body, secret);

let counter = 0;
function envelope(event: string, data: unknown = {}): string {
  return JSON.stringify({
    event,
    delivery_id: `dlv_test_${Date.now()}_${counter++}`,
    timestamp: '2026-06-22T12:00:00Z',
    org_id: 1,
    data,
  });
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-webhook-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/learnhouse', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyLearnhouseSignature', () => {
  const body = Buffer.from('{"event":"ping"}');
  const good = hmacHex(body.toString());

  it('accepts prefixed, bare and uppercase digests', () => {
    expect(verifyLearnhouseSignature(body, `sha256=${good}`, SECRET)).toBe(true);
    expect(verifyLearnhouseSignature(body, good, SECRET)).toBe(true);
    expect(verifyLearnhouseSignature(body, `sha256=${good.toUpperCase()}`, SECRET)).toBe(true);
  });

  it('rejects bad secrets, empty values and malformed digests', () => {
    expect(verifyLearnhouseSignature(body, `sha256=${good}`, 'other')).toBe(false);
    expect(verifyLearnhouseSignature(body, `sha256=${good}`, '')).toBe(false);
    expect(verifyLearnhouseSignature(body, '', SECRET)).toBe(false);
    expect(verifyLearnhouseSignature(body, null, SECRET)).toBe(false);
    expect(verifyLearnhouseSignature(body, `sha256=${good.slice(0, 63)}`, SECRET)).toBe(false);
    expect(verifyLearnhouseSignature(body, `sha256=${good.slice(0, 63)}z`, SECRET)).toBe(false);
    expect(verifyLearnhouseSignature(body, `sha1=${good}`, SECRET)).toBe(false);
  });

  it('uses the whole whsec_ string as the key', () => {
    const stripped = hmacHex(body.toString(), SECRET.slice('whsec_'.length));
    expect(verifyLearnhouseSignature(body, `sha256=${stripped}`, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/learnhouse', () => {
  it('accepts a valid signature', async () => {
    const body = envelope('course_completed', {
      user: { user_uuid: 'user_1', email: 'learner@example.com', username: 'learner' },
      course: { course_uuid: 'course_1', name: 'Introduction to Python' },
    });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies the raw bytes for any content type', async () => {
    const body = envelope('ping');
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('rejects missing, malformed and wrong signatures with 401', async () => {
    const body = envelope('ping');
    for (const sig of [undefined, '', 'sha256=', 'sha256=abc', sign(body, 'other')]) {
      const res = await POST(makeRequest(body, sig));
      expect(res.status).toBe(401);
    }
  });

  it('rejects a tampered body', async () => {
    const body = envelope('ping');
    const res = await POST(makeRequest(body.replace('ping', 'pong'), sign(body)));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not a JSON object', async () => {
    for (const body of ['not json', '[1,2]', '"str"', '{"event":5}', '']) {
      const res = await POST(makeRequest(body, sign(body), 'text/plain'));
      expect(res.status).toBe(400);
    }
  });

  it('ignores wrong-typed nested fields', async () => {
    for (const data of ['x', null, [], { user: 'x', course: [1] }, { user: { email: 5 }, course: { name: {} } }]) {
      const body = envelope('course_completed', data);
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
    }
  });

  it('handles known and unknown events', async () => {
    for (const event of ['ping', 'course_enrolled', 'activity_completed', 'assignment_submitted', 'assignment_graded', 'certificate_claimed', 'user_signed_up', 'pack_activated']) {
      const body = envelope(event);
      expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
    }
  });

  it('flags a repeated delivery_id as a duplicate', async () => {
    const body = envelope('course_enrolled');
    const first = await (await POST(makeRequest(body, sign(body)))).json();
    expect(first.duplicate).toBeUndefined();
    const second = await (await POST(makeRequest(body, sign(body)))).json();
    expect(second.duplicate).toBe(true);
  });
});
