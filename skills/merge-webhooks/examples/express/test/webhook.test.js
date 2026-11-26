// Generated with: merge-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

const KEY = 'merge_synthetic_signature_key_8Rf3'; // synthetic
process.env.MERGE_WEBHOOK_SIGNATURE_KEY = KEY;

const { app, verifyMergeSignature } = require('../src/index');

const BODY = '{"hook":{"id":"cb1fe0a7-c2a1-4bd6-8cf5-57e70c7f1d53","event":"Candidate.changed","target":"https://example.com/webhooks/merge"},"linked_account":{"id":"a3602c03-aba7-4d9d-a349-dbc338504092","integration":"Workday","integration_slug":"workday","category":"ats","end_user_origin_id":"customer-42","end_user_organization_name":"Example Co","status":"COMPLETE","account_type":"PRODUCTION"},"data":{"id":"22582af6-b45e-4d34-bed6-77bb40effa97","remote_id":"97134123","first_name":"Gil","last_name":"Feig"}}';
const PASSTHROUGH_BODY = '{"hook":{"id":"32b4aa43-f48f-4fe3-8d09-583fe3b33748","event":"AsyncPassthrough.resolved","target":"https://example.com/webhooks/merge"},"async_passthrough_receipt_id":"c90c595f-c62b-4b8f-946d-3fc48c84c7c5","status":"COMPLETED","data":{"method":"GET","path":"/employees/1761","status":200,"response":{"id":"1761"}}}';

/** Padded base64url, as in Merge's Python, Ruby and Node samples. */
const sign = (body, key = KEY) =>
  crypto.createHmac('sha256', key).update(body).digest('base64').replace(/\+/g, '-').replace(/\//g, '_');

const post = (body, signature) => {
  const req = request(app).post('/webhooks/merge').set('Content-Type', 'application/json');
  if (signature !== undefined) req.set('X-Merge-Webhook-Signature', signature);
  return req.send(body);
};

beforeEach(() => {
  process.env.MERGE_WEBHOOK_SIGNATURE_KEY = KEY;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyMergeSignature', () => {
  // Computed with Merge's own Python, Ruby and Node samples (key "k", body "{}").
  const VECTOR = 'rdhTsQP7zJNqGU-esV4pxP8Ir25H1dG8pPICGOMeT_8=';

  it("matches the padded output of Merge's samples", () => {
    expect(verifyMergeSignature('{}', VECTOR, 'k')).toBe(true);
  });

  it('accepts the same signature without padding', () => {
    expect(verifyMergeSignature('{}', VECTOR.replace(/=$/, ''), 'k')).toBe(true);
  });

  it('rejects standard base64 (+ and /) in place of base64url', () => {
    expect(verifyMergeSignature('{}', VECTOR.replace(/-/g, '+').replace(/_/g, '/'), 'k')).toBe(false);
  });
});

describe('POST /webhooks/merge', () => {
  it('accepts a valid padded signature', async () => {
    const signature = sign(BODY);
    expect(signature.endsWith('=')).toBe(true);
    const res = await post(BODY, signature);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      received: true,
      event: 'Candidate.changed',
      linked_account_id: 'a3602c03-aba7-4d9d-a349-dbc338504092',
    });
  });

  it('handles events without a linked account', async () => {
    const res = await post(PASSTHROUGH_BODY, sign(PASSTHROUGH_BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event: 'AsyncPassthrough.resolved', linked_account_id: null });
  });

  it('rejects a signature made with another key', async () => {
    expect((await post(BODY, sign(BODY, 'another_signature_key'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(BODY.replace('"Gil"', '"Bob"'), sign(BODY))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a key with a trailing newline', async () => {
    process.env.MERGE_WEBHOOK_SIGNATURE_KEY = `${KEY}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when MERGE_WEBHOOK_SIGNATURE_KEY is not set', async () => {
    delete process.env.MERGE_WEBHOOK_SIGNATURE_KEY;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
