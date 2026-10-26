import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/absorb-lms/route';
import { verifyAbsorbSignature } from '../lib/verify-absorb';

const SECRET = 'test_absorb_secret_key_0123456789';

beforeAll(() => {
  process.env.ABSORB_WEBHOOK_SECRET = SECRET;
});

// Lean payload: the event name plus IDs. Only eventName is relied on; the other key names
// are illustrative because Absorb's article doesn't publish them.
function samplePayload(eventName = 'UserCreated') {
  return { eventName, userId: 'user-1', correlationId: 'corr-1' };
}

// absorb-signature = lowercase hex HMAC-SHA256 of the raw body, keyed with the Secret Key
function sign(body: string | Buffer, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/absorb-lms', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/absorb-lms', () => {
  it('accepts a valid signature', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest({ 'absorb-signature': sign(body) }, body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest({ 'absorb-signature': sign(body).toUpperCase() }, body));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest({ 'absorb-signature': sign(body) }, body, 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes received, including odd whitespace', async () => {
    const body = '{ "eventName" :   "UserCreated" }\n';
    const res = await POST(makeRequest({ 'absorb-signature': sign(body) }, body));
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest({ 'absorb-signature': sign(body, 'wrong_secret') }, body));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const signed = JSON.stringify(samplePayload());
    const tampered = JSON.stringify(samplePayload('CertificateAwarded'));
    const res = await POST(makeRequest({ 'absorb-signature': sign(signed) }, tampered));
    expect(res.status).toBe(401);
  });

  it('rejects a random signature like the Test Webhook button sends', async () => {
    const random = crypto.randomBytes(32).toString('hex');
    const res = await POST(makeRequest({ 'absorb-signature': random }));
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
      const res = await POST(makeRequest({ 'absorb-signature': bad }, body));
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 for invalid JSON after verifying the signature', async () => {
    const res = await POST(makeRequest({ 'absorb-signature': sign('not json') }, 'not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    const res = await POST(makeRequest({ 'absorb-signature': sign('[1,2]') }, '[1,2]'));
    expect(res.status).toBe(400);
  });

  it.each([
    'UserCreated',
    'OnlineCourseActivated',
    'EnrollmentCompletedbyAdmin',
    'EnrollmentCompletedbyLearner',
    'CertificateAwarded',
    'CompetencyAwarded',
    'CourseCreditsAwarded',
    'UserEnrolledinCoursebyAdmin',
    'UserEnrolledinCoursebyLearner',
    'DepartmentCreated',
    'SomethingElse',
  ])('returns 200 for %s', async (eventName) => {
    const body = JSON.stringify(samplePayload(eventName));
    const res = await POST(makeRequest({ 'absorb-signature': sign(body) }, body));
    expect(res.status).toBe(200);
  });
});

describe('verifyAbsorbSignature', () => {
  const body = Buffer.from(JSON.stringify(samplePayload()));

  it('accepts a matching signature', () => {
    expect(verifyAbsorbSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects when no secret is configured', () => {
    expect(verifyAbsorbSignature(body, sign(body), '')).toBe(false);
    // An undefined argument falls back to the env var, so unset it to test "not configured"
    delete process.env.ABSORB_WEBHOOK_SECRET;
    try {
      expect(verifyAbsorbSignature(body, sign(body))).toBe(false);
    } finally {
      process.env.ABSORB_WEBHOOK_SECRET = SECRET;
    }
  });

  it('rejects null, undefined and non-hex signatures without throwing', () => {
    expect(verifyAbsorbSignature(body, null, SECRET)).toBe(false);
    expect(verifyAbsorbSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyAbsorbSignature(body, 'é'.repeat(64), SECRET)).toBe(false);
  });
});
