import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyHintSignature } from '../lib/verify';
import { POST } from '../app/webhooks/hint-health/route';

const SECRET = 'test_partner_api_key_0123456789';

beforeAll(() => {
  process.env.HINT_HEALTH_WEBHOOK_SECRET = SECRET;
});

// Same algorithm as Hint Health: hex(HMAC-SHA256(rawBody, signatureKey))
function digest(body: string | Buffer, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}
const sign = (body: string | Buffer, secret = SECRET) => `sha256=${digest(body, secret)}`;

// Payload as shown in the Hint Health docs
const patientCreated = {
  id: 'evt-jKi2jlalOJk3',
  created_at: '2015-02-19T10:49:21.419-08:00',
  type: 'patient.created',
  practice_id: 'pra-6BIBTelN3rM5',
  object: { id: 'pat-eN9DgCQ9iQxL', first_name: 'Jane', last_name: 'Doe' },
};

function post(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-hint-signature'] = signature;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/hint-health', { method: 'POST', headers, body })
  );
}

describe('verifyHintSignature', () => {
  const body = Buffer.from(JSON.stringify(patientCreated));

  it('accepts the sha256= prefixed digest', () => {
    expect(verifyHintSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('accepts the bare digest', () => {
    expect(verifyHintSignature(body, digest(body), SECRET)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    expect(verifyHintSignature(body, digest(body).toUpperCase(), SECRET)).toBe(true);
    expect(verifyHintSignature(body, `sha256=${digest(body).toUpperCase()}`, SECRET)).toBe(true);
  });

  it('rejects malformed values without throwing', () => {
    expect(verifyHintSignature(body, '', SECRET)).toBe(false);
    expect(verifyHintSignature(body, 'sha256=', SECRET)).toBe(false);
    expect(verifyHintSignature(body, 'sha256=abcd', SECRET)).toBe(false);
    expect(verifyHintSignature(body, `sha256=${'z'.repeat(64)}`, SECRET)).toBe(false);
    expect(verifyHintSignature(body, `${digest(body)}00`, SECRET)).toBe(false);
    expect(verifyHintSignature(body, `sha1=${digest(body)}`, SECRET)).toBe(false);
    expect(verifyHintSignature(body, null, SECRET)).toBe(false);
  });

  it('rejects a wrong secret or missing secret', () => {
    expect(verifyHintSignature(body, sign(body, 'other_key'), SECRET)).toBe(false);
    expect(verifyHintSignature(body, sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/hint-health', () => {
  it('accepts a valid signature and the documented patient.created payload', async () => {
    const body = JSON.stringify(patientCreated);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts the bare digest', async () => {
    const body = JSON.stringify(patientCreated);
    expect((await post(body, digest(body))).status).toBe(200);
  });

  it('verifies the exact bytes received, not a re-serialized body', async () => {
    const body = JSON.stringify(patientCreated, null, 4);
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('verifies any content type', async () => {
    const body = JSON.stringify(patientCreated);
    expect((await post(body, sign(body), 'text/plain')).status).toBe(200);
  });

  it.each([
    'patient.updated',
    'patient.destroyed',
    'patient.inactive',
    'membership.created',
    'membership.updated',
    'membership.destroyed',
    'practitioner.created',
    'practitioner.updated',
    'practitioner.destroyed',
    'company.created',
  ])('handles %s', async (type) => {
    const body = JSON.stringify({ ...patientCreated, type });
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('returns 401 when the signature header is missing', async () => {
    expect((await post(JSON.stringify(patientCreated))).status).toBe(401);
  });

  it('returns 401 when the signature header is empty', async () => {
    expect((await post(JSON.stringify(patientCreated), '')).status).toBe(401);
  });

  it('returns 401 for a malformed signature', async () => {
    const body = JSON.stringify(patientCreated);
    expect((await post(body, 'sha256=nothex')).status).toBe(401);
    expect((await post(body, `sha256=${digest(body).slice(0, 62)}`)).status).toBe(401);
  });

  it('returns 401 for a signature from the wrong key', async () => {
    const body = JSON.stringify(patientCreated);
    expect((await post(body, sign(body, 'other_key'))).status).toBe(401);
  });

  it('returns 401 when the body was tampered with', async () => {
    const body = JSON.stringify(patientCreated);
    const tampered = JSON.stringify({ ...patientCreated, practice_id: 'pra-other' });
    expect((await post(tampered, sign(body))).status).toBe(401);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, sign(body), 'text/plain')).status).toBe(400);
  });

  it('returns 400 for a validly signed JSON body that is not an object', async () => {
    for (const body of ['[]', 'null', '"text"', '42']) {
      expect((await post(body, sign(body))).status).toBe(400);
    }
  });

  it('ignores wrong-typed fields instead of failing', async () => {
    const payloads = [
      { type: 123, object: 'x' },
      { type: 'patient.created', object: 'not an object' },
      { type: 'membership.updated', object: [1, 2], id: 5 },
      { type: ['patient.created'], object: null },
      {},
    ];
    for (const payload of payloads) {
      const body = JSON.stringify(payload);
      expect((await post(body, sign(body))).status).toBe(200);
    }
  });
});
