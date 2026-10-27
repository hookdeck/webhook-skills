const crypto = require('crypto');
const request = require('supertest');

process.env.SURVEYMETHODS_WEBHOOK_SECRET = 'surveymethods_test_signing_secret';
const { app, verifySurveyMethodsSignature } = require('../src/index');

const SECRET = process.env.SURVEYMETHODS_WEBHOOK_SECRET;

function digest(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}
function sign(body, secret = SECRET) {
  return 'sha256=' + digest(body, secret);
}

// Shape of the vendor's documented response.completed sample
const completed = JSON.stringify({
  eventId: '6a1f0c3e-2b9d-4f7a-9c51-0e8d2f4b7a10',
  eventType: 'response.completed',
  eventTime: '2026-10-23T10:15:02Z',
  data: {
    surveyId: '12345',
    respondentId: 6789,
    collectorId: 456,
    completedDateTimeUtc: '2026-10-23T10:15:00Z',
    responses: { 910001: '3', 910002: 'Great support team.' },
  },
});
const eventBody = (eventType, data = {}) =>
  JSON.stringify({ eventId: 'evt_1', eventType, eventTime: '2026-10-23T10:15:02Z', data });

describe('verifySurveyMethodsSignature', () => {
  it('accepts a valid signature, with or without the prefix, in either hex case', () => {
    expect(verifySurveyMethodsSignature(Buffer.from(completed), sign(completed), SECRET)).toBe(true);
    expect(verifySurveyMethodsSignature(Buffer.from(completed), digest(completed), SECRET)).toBe(true);
    expect(verifySurveyMethodsSignature(Buffer.from(completed), sign(completed).toUpperCase().replace('SHA256=', 'sha256='), SECRET)).toBe(true);
  });
  it('rejects wrong secret, missing header, bad hex, wrong length, array header', () => {
    expect(verifySurveyMethodsSignature(Buffer.from(completed), sign(completed, 'other'), SECRET)).toBe(false);
    expect(verifySurveyMethodsSignature(Buffer.from(completed), undefined, SECRET)).toBe(false);
    expect(verifySurveyMethodsSignature(Buffer.from(completed), '', SECRET)).toBe(false);
    expect(verifySurveyMethodsSignature(Buffer.from(completed), 'sha256=' + 'zz'.repeat(32), SECRET)).toBe(false);
    expect(verifySurveyMethodsSignature(Buffer.from(completed), 'sha256=abcd', SECRET)).toBe(false);
    expect(verifySurveyMethodsSignature(Buffer.from(completed), [sign(completed)], SECRET)).toBe(false);
  });
});

describe('POST /webhooks/surveymethods', () => {
  const post = (body, headers = {}, type = 'application/json') =>
    request(app).post('/webhooks/surveymethods').set('Content-Type', type).set(headers).send(body);

  it.each([
    ['response.completed', completed],
    ['response.created', eventBody('response.created', { surveyId: '12345' })],
    ['survey.created', eventBody('survey.created', { surveyId: '12345' })],
    ['collector.created', eventBody('collector.created', { collectorId: 456 })],
    ['an unknown event', eventBody('something.else')],
  ])('accepts a signed %s', async (_n, body) => {
    const res = await post(body, { 'X-SurveyMethods-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a bare digest and an unusual content type', async () => {
    const res = await post(completed, { 'X-SurveyMethods-Signature': digest(completed) }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects an unsigned request with 401', async () => {
    expect((await post(completed)).status).toBe(401);
  });

  it('rejects a bad signature with 401', async () => {
    const res = await post(completed, { 'X-SurveyMethods-Signature': sign(completed, 'wrong') });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body with 401', async () => {
    const res = await post(completed.replace('12345', '99999'), { 'X-SurveyMethods-Signature': sign(completed) });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed but malformed JSON body', async () => {
    const bad = '{not json';
    expect((await post(bad, { 'X-SurveyMethods-Signature': sign(bad) })).status).toBe(400);
  });

  it.each(['null', '42', '[1,2]'])('returns 400 for a signed non-object body %s', async (body) => {
    expect((await post(body, { 'X-SurveyMethods-Signature': sign(body) })).status).toBe(400);
  });
});
