// Generated with: surveymonkey-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic credentials
const CLIENT_ID = 'sm_synthetic_client_id_1a2b';
const CLIENT_SECRET = 'sm_synthetic_client_secret_3c4d5e6f';
process.env.SURVEYMONKEY_CLIENT_ID = CLIENT_ID;
process.env.SURVEYMONKEY_CLIENT_SECRET = CLIENT_SECRET;

const { app, verifySurveyMonkeySignature } = require('../src/index');

const BODY = '{"name":"Survey responses","filter_type":"survey","filter_id":"405000001","event_type":"response_completed","event_id":"10000000001","object_type":"response","object_id":"118000000001","event_datetime":"2026-11-18T10:15:00.000000+00:00","resources":{"respondent_id":"118000000001","recipient_id":"0","collector_id":"431000001","survey_id":"405000001","user_id":"155000001"}}';
const SURVEY_BODY = '{"name":"New surveys","filter_type":"survey","filter_id":"0","event_type":"survey_created","event_id":"10000000002","object_type":"survey","object_id":"405000002","event_datetime":"2026-11-18T10:20:00.000000+00:00","resources":{"survey_id":"405000002","user_id":"155000001"}}';
const CONTENT_TYPE = 'application/vnd.surveymonkey.response.v1+json';

const sign = (body, key = `${CLIENT_ID}&${CLIENT_SECRET}`) =>
  crypto.createHmac('sha1', key).update(body).digest('base64');

const post = (body, signature) => {
  const req = request(app).post('/webhooks/surveymonkey').set('Content-Type', CONTENT_TYPE).set('Sm-Apikey', CLIENT_ID);
  if (signature !== undefined) req.set('Sm-Signature', signature);
  return req.send(body);
};

beforeEach(() => {
  process.env.SURVEYMONKEY_CLIENT_ID = CLIENT_ID;
  process.env.SURVEYMONKEY_CLIENT_SECRET = CLIENT_SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifySurveyMonkeySignature', () => {
  it('keys the HMAC with "<client ID>&<secret>"', () => {
    expect(verifySurveyMonkeySignature(BODY, sign(BODY), CLIENT_ID, CLIENT_SECRET)).toBe(true);
  });

  it('rejects a signature keyed with the secret alone', () => {
    expect(verifySurveyMonkeySignature(BODY, sign(BODY, CLIENT_SECRET), CLIENT_ID, CLIENT_SECRET)).toBe(false);
  });

  it('rejects a hex signature: SurveyMonkey sends base64', () => {
    const hex = crypto.createHmac('sha1', `${CLIENT_ID}&${CLIENT_SECRET}`).update(BODY).digest('hex');
    expect(verifySurveyMonkeySignature(BODY, hex, CLIENT_ID, CLIENT_SECRET)).toBe(false);
  });
});

describe('/webhooks/surveymonkey', () => {
  it('answers the HEAD check with 200', async () => {
    const res = await request(app).head('/webhooks/surveymonkey');
    expect(res.status).toBe(200);
  });

  it('accepts a valid signature with the SurveyMonkey content type', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event_type: 'response_completed', event_id: '10000000001' });
  });

  it('handles survey events', async () => {
    const res = await post(SURVEY_BODY, sign(SURVEY_BODY));
    expect(res.status).toBe(200);
    expect(res.body.event_type).toBe('survey_created');
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(BODY, sign(BODY, `${CLIENT_ID}&wrong_secret`))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(BODY.replace('"405000001"', '"405000009"'), sign(BODY))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
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
    process.env.SURVEYMONKEY_CLIENT_SECRET = CLIENT_SECRET;
    delete process.env.SURVEYMONKEY_CLIENT_ID;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
