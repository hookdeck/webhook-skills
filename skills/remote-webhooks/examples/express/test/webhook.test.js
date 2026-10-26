const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'wkyzvs764ifdrpct2naqhksmq4'; // a Remote signing_key: used as plain UTF-8
process.env.REMOTE_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyRemoteSignature } = require('../src/index');

// Published test vector from https://developer.remote.com/docs/verifying-webhooks
// (compact 376-byte body, exactly as in the docs)
const VECTOR_BODY = '{"company_id":"9e88cdac-4e57-46ca-a5a8-580150935cd8","completed_task":{"action":"identity_verification","completed_at":"2023-02-16T07:52:26Z","description":"To help us keep you and our platform safe.","name":"Verify your identity","required":true,"status":"completed"},"employment_id":"b6e66f7c-9026-4afc-9f43-37bb31a8e509","event_type":"employment.onboarding_task.completed"}';
const VECTOR_TIMESTAMP = '1677816097219';
const VECTOR_SIGNATURE = 'e3f4092f158983aea32ab25f6fecc59f64b26d45fadbed6409893f3a882abef7';

function sign(body, timestamp, secret = SECRET) {
  return crypto.createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(body), Buffer.from(':'), Buffer.from(timestamp, 'latin1')]))
    .digest('hex');
}

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/remote')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

function signed(payload, timestamp = String(Date.now())) {
  const body = JSON.stringify(payload);
  return post(body, { 'X-Remote-Timestamp': timestamp, 'X-Remote-Signature': sign(body, timestamp) });
}

describe('published test vector', () => {
  it('has the documented 376-byte body', () => {
    expect(Buffer.byteLength(VECTOR_BODY)).toBe(376);
  });

  it('computes the documented signature', () => {
    expect(sign(VECTOR_BODY, VECTOR_TIMESTAMP)).toBe(VECTOR_SIGNATURE);
  });

  it('is accepted by the verifier', () => {
    const headers = { 'x-remote-timestamp': VECTOR_TIMESTAMP, 'x-remote-signature': VECTOR_SIGNATURE };
    expect(verifyRemoteSignature(Buffer.from(VECTOR_BODY), headers, SECRET, 0)).toBe(true);
  });

  it('is accepted by the endpoint', async () => {
    const res = await post(VECTOR_BODY, {
      'X-Remote-Timestamp': VECTOR_TIMESTAMP,
      'X-Remote-Signature': VECTOR_SIGNATURE,
    });
    expect(res.status).toBe(200);
  });
});

describe('verifyRemoteSignature', () => {
  const body = Buffer.from(VECTOR_BODY);
  const ok = { 'x-remote-timestamp': VECTOR_TIMESTAMP, 'x-remote-signature': VECTOR_SIGNATURE };

  it('accepts an uppercase hex digest', () => {
    expect(verifyRemoteSignature(body, { ...ok, 'x-remote-signature': VECTOR_SIGNATURE.toUpperCase() }, SECRET, 0)).toBe(true);
  });

  it.each([
    ['missing signature', { 'x-remote-timestamp': VECTOR_TIMESTAMP }],
    ['empty signature', { ...ok, 'x-remote-signature': '' }],
    ['missing timestamp', { 'x-remote-signature': VECTOR_SIGNATURE }],
    ['empty timestamp', { ...ok, 'x-remote-timestamp': '' }],
    ['short signature', { ...ok, 'x-remote-signature': VECTOR_SIGNATURE.slice(0, 62) }],
    ['non-hex signature', { ...ok, 'x-remote-signature': 'zz' + VECTOR_SIGNATURE.slice(2) }],
    ['prefixed signature', { ...ok, 'x-remote-signature': `sha256=${VECTOR_SIGNATURE}` }],
    ['different timestamp', { ...ok, 'x-remote-timestamp': '1677816097220' }],
  ])('rejects %s', (_name, headers) => {
    expect(verifyRemoteSignature(body, headers, SECRET, 0)).toBe(false);
  });

  it('rejects a wrong secret and a tampered body', () => {
    expect(verifyRemoteSignature(body, ok, 'other-secret', 0)).toBe(false);
    expect(verifyRemoteSignature(Buffer.from(VECTOR_BODY + ' '), ok, SECRET, 0)).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    expect(verifyRemoteSignature(body, ok, '', 0)).toBe(false);
  });

  it('does not reject old timestamps by default', () => {
    expect(verifyRemoteSignature(body, ok, SECRET, 0)).toBe(true);
  });

  it('enforces the opt-in tolerance (milliseconds timestamp, seconds tolerance)', () => {
    expect(verifyRemoteSignature(body, ok, SECRET, 300)).toBe(false); // 2023 timestamp
    const now = String(Date.now());
    const headers = { 'x-remote-timestamp': now, 'x-remote-signature': sign(VECTOR_BODY, now) };
    expect(verifyRemoteSignature(body, headers, SECRET, 300)).toBe(true);
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
    const res = await signed(payload);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each([
    'employment.onboarding.completed',
    'timeoff.requested',
    'payslip.released',
    'contract.termination_date_reached',
    'expense.submitted',
  ])('handles %s', async (event_type) => {
    const res = await signed({ ...payload, event_type });
    expect(res.status).toBe(200);
  });

  it('returns 401 for a missing signature', async () => {
    const res = await post(JSON.stringify(payload), { 'X-Remote-Timestamp': '1677816097219' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a bad signature', async () => {
    const res = await post(JSON.stringify(payload), {
      'X-Remote-Timestamp': '1677816097219',
      'X-Remote-Signature': 'a'.repeat(64),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not a JSON object', async () => {
    const ts = String(Date.now());
    const res = await post('not json', { 'X-Remote-Timestamp': ts, 'X-Remote-Signature': sign('not json', ts) });
    expect(res.status).toBe(400);
  });

  it('verifies the exact bytes for any content type', async () => {
    const body = JSON.stringify(payload);
    const ts = String(Date.now());
    const res = await request(app)
      .post('/webhooks/remote')
      .set('Content-Type', 'text/plain')
      .set({ 'X-Remote-Timestamp': ts, 'X-Remote-Signature': sign(body, ts) })
      .send(body);
    expect(res.status).toBe(200);
  });
});
