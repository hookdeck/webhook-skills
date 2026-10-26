import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'wkyzvs764ifdrpct2naqhksmq4'; // a Remote signing_key: used as plain UTF-8

let POST: (req: NextRequest) => Promise<Response>;
let verifyRemoteSignature: (
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  secret?: string,
  toleranceSeconds?: number,
) => boolean;

beforeAll(async () => {
  process.env.REMOTE_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/remote/route'));
  ({ verifyRemoteSignature } = await import('../lib/verify-remote'));
});

// Published test vector from https://developer.remote.com/docs/verifying-webhooks
// (compact 376-byte body, exactly as in the docs)
const VECTOR_BODY = '{"company_id":"9e88cdac-4e57-46ca-a5a8-580150935cd8","completed_task":{"action":"identity_verification","completed_at":"2023-02-16T07:52:26Z","description":"To help us keep you and our platform safe.","name":"Verify your identity","required":true,"status":"completed"},"employment_id":"b6e66f7c-9026-4afc-9f43-37bb31a8e509","event_type":"employment.onboarding_task.completed"}';
const VECTOR_TIMESTAMP = '1677816097219';
const VECTOR_SIGNATURE = 'e3f4092f158983aea32ab25f6fecc59f64b26d45fadbed6409893f3a882abef7';

function sign(body: string, timestamp: string, secret = SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(body), Buffer.from(':'), Buffer.from(timestamp, 'latin1')]))
    .digest('hex');
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/remote', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

function signedRequest(payload: object, timestamp = String(Date.now())) {
  const body = JSON.stringify(payload);
  return makeRequest(body, { 'x-remote-timestamp': timestamp, 'x-remote-signature': sign(body, timestamp) });
}

describe('published test vector', () => {
  it('has the documented 376-byte body', () => {
    expect(Buffer.byteLength(VECTOR_BODY)).toBe(376);
  });

  it('computes the documented signature', () => {
    expect(sign(VECTOR_BODY, VECTOR_TIMESTAMP)).toBe(VECTOR_SIGNATURE);
  });

  it('is accepted by the verifier', () => {
    expect(verifyRemoteSignature(Buffer.from(VECTOR_BODY), VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET, 0)).toBe(true);
  });

  it('is accepted by the route', async () => {
    const res = await POST(
      makeRequest(VECTOR_BODY, { 'x-remote-timestamp': VECTOR_TIMESTAMP, 'x-remote-signature': VECTOR_SIGNATURE }),
    );
    expect(res.status).toBe(200);
  });
});

describe('verifyRemoteSignature', () => {
  const body = Buffer.from(VECTOR_BODY);

  it('accepts an uppercase hex digest', () => {
    expect(verifyRemoteSignature(body, VECTOR_SIGNATURE.toUpperCase(), VECTOR_TIMESTAMP, SECRET, 0)).toBe(true);
  });

  it.each([
    ['missing signature', null, VECTOR_TIMESTAMP],
    ['empty signature', '', VECTOR_TIMESTAMP],
    ['missing timestamp', VECTOR_SIGNATURE, null],
    ['empty timestamp', VECTOR_SIGNATURE, ''],
    ['short signature', VECTOR_SIGNATURE.slice(0, 62), VECTOR_TIMESTAMP],
    ['non-hex signature', 'zz' + VECTOR_SIGNATURE.slice(2), VECTOR_TIMESTAMP],
    ['prefixed signature', `sha256=${VECTOR_SIGNATURE}`, VECTOR_TIMESTAMP],
    ['different timestamp', VECTOR_SIGNATURE, '1677816097220'],
  ])('rejects %s', (_name, signature, timestamp) => {
    expect(verifyRemoteSignature(body, signature, timestamp, SECRET, 0)).toBe(false);
  });

  it('rejects a wrong secret and a tampered body', () => {
    expect(verifyRemoteSignature(body, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, 'other-secret', 0)).toBe(false);
    expect(verifyRemoteSignature(Buffer.from(VECTOR_BODY + ' '), VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET, 0)).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    expect(verifyRemoteSignature(body, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, '', 0)).toBe(false);
  });

  it('does not reject old timestamps by default', () => {
    expect(verifyRemoteSignature(body, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET, 0)).toBe(true);
  });

  it('enforces the opt-in tolerance (milliseconds timestamp, seconds tolerance)', () => {
    expect(verifyRemoteSignature(body, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET, 300)).toBe(false); // 2023 timestamp
    const now = String(Date.now());
    expect(verifyRemoteSignature(body, sign(VECTOR_BODY, now), now, SECRET, 300)).toBe(true);
  });
});

describe('POST /webhooks/remote', () => {
  const payload = {
    company_id: '9e88cdac-4e57-46ca-a5a8-580150935cd8',
    completed_task: {
      action: 'identity_verification',
      completed_at: '2023-02-16T07:52:26Z',
      description: 'To help us keep you and our platform safe.',
      name: 'Verify your identity',
      required: true,
      status: 'completed',
    },
    employment_id: 'b6e66f7c-9026-4afc-9f43-37bb31a8e509',
    event_type: 'employment.onboarding_task.completed',
  };

  it('accepts a correctly signed event', async () => {
    const res = await POST(signedRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it.each([
    'employment.onboarding.completed',
    'timeoff.requested',
    'payslip.released',
    'contract.termination_date_reached',
    'expense.submitted',
  ])('handles %s', async (event_type) => {
    const res = await POST(signedRequest({ ...payload, event_type }));
    expect(res.status).toBe(200);
  });

  it('returns 401 for a missing signature', async () => {
    const res = await POST(makeRequest(JSON.stringify(payload), { 'x-remote-timestamp': '1677816097219' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a bad signature', async () => {
    const res = await POST(
      makeRequest(JSON.stringify(payload), {
        'x-remote-timestamp': '1677816097219',
        'x-remote-signature': 'a'.repeat(64),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not a JSON object', async () => {
    const ts = String(Date.now());
    const res = await POST(makeRequest('not json', { 'x-remote-timestamp': ts, 'x-remote-signature': sign('not json', ts) }));
    expect(res.status).toBe(400);
  });
});
