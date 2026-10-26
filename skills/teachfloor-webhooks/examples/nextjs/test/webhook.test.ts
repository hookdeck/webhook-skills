import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/teachfloor/route';
import { verifyTeachfloorSignature } from '../lib/verify-teachfloor';

const SECRET = 'test_teachfloor_signing_secret_0123456789';

beforeAll(() => {
  process.env.TEACHFLOOR_WEBHOOK_SECRET = SECRET;
});

// Payloads follow Teachfloor's documented course.join and element.completed examples.
const MEMBER = { id: 'usr_123', object: 'member', full_name: 'John Doe', email: 'john@example.com' };

function samplePayload(type = 'course.join') {
  if (type === 'element.completed') {
    return {
      id: 'evt_def456',
      type,
      created_at: '2025-10-07T15:30:00.000000Z',
      data: {
        id: 'act_789',
        object: 'activity',
        status: 'completed',
        passed: true,
        score: 95,
        member: MEMBER,
        context: { id: 'elm_321', object: 'element', name: 'Introduction Video', type: 'video', module: 'mod_654' },
      },
    };
  }
  return {
    id: 'evt_abc123',
    type,
    created_at: '2025-10-07T15:30:00.000000Z',
    data: {
      id: 'cm_xyz789',
      object: 'course_member',
      member: MEMBER,
      course: { id: 'crs_456', object: 'course', name: 'Introduction to Development', status: 'published' },
    },
  };
}

// teachfloor-signature = hex HMAC-SHA256 of the raw body, keyed with the signing secret
function sign(body: string | Buffer, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/teachfloor', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/teachfloor', () => {
  it('accepts a valid signature', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest({ 'teachfloor-signature': sign(body) }, body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest({ 'teachfloor-signature': sign(body).toUpperCase() }, body));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest({ 'teachfloor-signature': sign(body) }, body, 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes received, including odd whitespace', async () => {
    const body = '{ "type" :   "course.join" }\n';
    const res = await POST(makeRequest({ 'teachfloor-signature': sign(body) }, body));
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest({ 'teachfloor-signature': sign(body, 'wrong_secret') }, body));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const signed = JSON.stringify(samplePayload());
    const tampered = JSON.stringify(samplePayload('course.completed'));
    const res = await POST(makeRequest({ 'teachfloor-signature': sign(signed) }, tampered));
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('rejects a signature that is not 64 hex characters', async () => {
    const body = JSON.stringify(samplePayload());
    const good = sign(body);
    for (const bad of ['', 'abc', good.slice(0, 62), good + '00', 'z'.repeat(64), `sha256=${good}`]) {
      const res = await POST(makeRequest({ 'teachfloor-signature': bad }, body));
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 for invalid JSON after verifying the signature', async () => {
    const res = await POST(makeRequest({ 'teachfloor-signature': sign('not json') }, 'not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    const res = await POST(makeRequest({ 'teachfloor-signature': sign('[1,2]') }, '[1,2]'));
    expect(res.status).toBe(400);
  });

  it.each([
    'course.created',
    'course.updated',
    'course.completed',
    'course.join',
    'module.created',
    'module.updated',
    'element.created',
    'element.updated',
    'element.deleted',
    'element.completed',
    'member.login',
    'something.else',
  ])('returns 200 for %s', async (type) => {
    const body = JSON.stringify(samplePayload(type));
    const res = await POST(makeRequest({ 'teachfloor-signature': sign(body) }, body));
    expect(res.status).toBe(200);
  });

  it('answers 200, not 500, when fields have unexpected types', async () => {
    for (const payload of [
      { type: 'course.join', data: 'oops' },
      { type: 'course.join', data: { member: 5, course: [] } },
      { type: 'element.completed', data: { member: null, context: 'x' } },
      { type: 'member.login', data: null },
      { type: 42, data: [] },
      {},
    ]) {
      const body = JSON.stringify(payload);
      const res = await POST(makeRequest({ 'teachfloor-signature': sign(body) }, body));
      expect(res.status).toBe(200);
    }
  });
});

describe('verifyTeachfloorSignature', () => {
  const body = Buffer.from(JSON.stringify(samplePayload()));

  it('accepts a matching signature', () => {
    expect(verifyTeachfloorSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects when no secret is configured', () => {
    expect(verifyTeachfloorSignature(body, sign(body), '')).toBe(false);
    // An undefined argument falls back to the env var, so unset it to test "not configured"
    delete process.env.TEACHFLOOR_WEBHOOK_SECRET;
    try {
      expect(verifyTeachfloorSignature(body, sign(body))).toBe(false);
    } finally {
      process.env.TEACHFLOOR_WEBHOOK_SECRET = SECRET;
    }
  });

  it('rejects null, undefined and non-hex signatures without throwing', () => {
    expect(verifyTeachfloorSignature(body, null, SECRET)).toBe(false);
    expect(verifyTeachfloorSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyTeachfloorSignature(body, 'é'.repeat(64), SECRET)).toBe(false);
  });
});
