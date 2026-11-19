// Generated with: surveymonkey-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { HEAD, POST } from '../app/webhooks/surveymonkey/route';
import { verifySurveyMonkeySignature } from '../lib/verify-surveymonkey';

const CLIENT_ID = 'sm_synthetic_client_id_1a2b';
const CLIENT_SECRET = 'sm_synthetic_client_secret_3c4d5e6f';
const BODY = '{"name":"Survey responses","filter_type":"survey","filter_id":"405000001","event_type":"response_completed","event_id":"10000000001","object_type":"response","object_id":"118000000001","event_datetime":"2026-11-18T10:15:00.000000+00:00","resources":{"respondent_id":"118000000001","recipient_id":"0","collector_id":"431000001","survey_id":"405000001","user_id":"155000001"}}';

const sign = (body: string, key = `${CLIENT_ID}&${CLIENT_SECRET}`) =>
  crypto.createHmac('sha1', key).update(body).digest('base64');

const post = (body: string, signature?: string) =>
  POST(
    new Request('http://localhost/webhooks/surveymonkey', {
      method: 'POST',
      headers: {
        'content-type': 'application/vnd.surveymonkey.response.v1+json',
        'sm-apikey': CLIENT_ID,
        ...(signature === undefined ? {} : { 'sm-signature': signature }),
      },
      body,
    })
  );

beforeEach(() => {
  process.env.SURVEYMONKEY_CLIENT_ID = CLIENT_ID;
  process.env.SURVEYMONKEY_CLIENT_SECRET = CLIENT_SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifySurveyMonkeySignature', () => {
  it('keys the HMAC with "<client ID>&<secret>", not the secret alone', () => {
    expect(verifySurveyMonkeySignature(BODY, sign(BODY), CLIENT_ID, CLIENT_SECRET)).toBe(true);
    expect(verifySurveyMonkeySignature(BODY, sign(BODY, CLIENT_SECRET), CLIENT_ID, CLIENT_SECRET)).toBe(false);
  });
});

describe('/webhooks/surveymonkey', () => {
  it('answers the HEAD check with 200', async () => {
    expect((await HEAD()).status).toBe(200);
  });

  it('accepts a valid signature with the SurveyMonkey content type', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event_type: 'response_completed', event_id: '10000000001' });
  });

  it('rejects another secret, a tampered body and a missing signature header', async () => {
    expect((await post(BODY, sign(BODY, `${CLIENT_ID}&wrong_secret`))).status).toBe(401);
    expect((await post(BODY.replace('"405000001"', '"405000009"'), sign(BODY))).status).toBe(401);
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts credentials with a trailing newline', async () => {
    process.env.SURVEYMONKEY_CLIENT_SECRET = `${CLIENT_SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when the client ID or secret is not set', async () => {
    delete process.env.SURVEYMONKEY_CLIENT_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
