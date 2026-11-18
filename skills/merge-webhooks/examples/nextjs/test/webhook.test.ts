// Generated with: merge-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/merge/route';
import { verifyMergeSignature } from '../lib/verify-merge';

const KEY = 'merge_synthetic_signature_key_8Rf3'; // synthetic
const BODY = '{"hook":{"id":"cb1fe0a7-c2a1-4bd6-8cf5-57e70c7f1d53","event":"Candidate.changed","target":"https://example.com/webhooks/merge"},"linked_account":{"id":"a3602c03-aba7-4d9d-a349-dbc338504092","integration":"Workday","integration_slug":"workday","category":"ats","end_user_origin_id":"customer-42","end_user_organization_name":"Example Co","status":"COMPLETE","account_type":"PRODUCTION"},"data":{"id":"22582af6-b45e-4d34-bed6-77bb40effa97","remote_id":"97134123","first_name":"Gil","last_name":"Feig"}}';

const sign = (body: string, key = KEY) =>
  crypto.createHmac('sha256', key).update(body).digest('base64').replace(/\+/g, '-').replace(/\//g, '_');

const post = (body: string, signature?: string) =>
  POST(
    new Request('http://localhost/webhooks/merge', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(signature === undefined ? {} : { 'x-merge-webhook-signature': signature }) },
      body,
    })
  );

beforeEach(() => {
  process.env.MERGE_WEBHOOK_SIGNATURE_KEY = KEY;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyMergeSignature', () => {
  const VECTOR = 'rdhTsQP7zJNqGU-esV4pxP8Ir25H1dG8pPICGOMeT_8='; // Merge's samples, key "k", body "{}"

  it('accepts the padded and unpadded forms and rejects standard base64', () => {
    expect(verifyMergeSignature('{}', VECTOR, 'k')).toBe(true);
    expect(verifyMergeSignature('{}', VECTOR.replace(/=$/, ''), 'k')).toBe(true);
    expect(verifyMergeSignature('{}', VECTOR.replace(/-/g, '+').replace(/_/g, '/'), 'k')).toBe(false);
  });
});

describe('POST /webhooks/merge', () => {
  it('accepts a valid padded signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      received: true,
      event: 'Candidate.changed',
      linked_account_id: 'a3602c03-aba7-4d9d-a349-dbc338504092',
    });
  });

  it('rejects another key, a tampered body and a missing signature header', async () => {
    expect((await post(BODY, sign(BODY, 'another_signature_key'))).status).toBe(401);
    expect((await post(BODY.replace('"Gil"', '"Bob"'), sign(BODY))).status).toBe(401);
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
