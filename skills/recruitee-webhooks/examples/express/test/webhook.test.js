const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'DuP4ej5yyJB5TIrIEI/dCtJN7sHj'; // plain string, used as-is (not decoded)
process.env.RECRUITEE_WEBHOOK_SECRET = SECRET;

const { app, verifyRecruiteeWebhook } = require('../src/index');

// Test vector published in the Recruitee docs
const VECTOR_BODY = "{\"attempt_count\":1,\"created_at\":\"2020-12-14T04:47:33.905241Z\",\"event_subtype\":\"stage_changed\",\"event_type\":\"candidate_moved\",\"id\":30,\"payload\":{\"candidate\":{\"created_at\":\"2020-12-09T14:36:56.578000Z\",\"emails\":[],\"id\":975539,\"name\":\"test\",\"phones\":[],\"photo_thumb_url\":\"https://recruitee-staging.s3.eu-central-1.amazonaws.com/candidates/975539/thumb_photo_anydaa715ph6.png\",\"referrer\":null,\"source\":\"manual\",\"updated_at\":\"2020-12-09T14:37:01.119831Z\"},\"company\":{\"id\":5943,\"name\":\"MP company 2\"},\"details\":{\"from_stage\":{\"id\":911876,\"name\":\"Phone interview\"},\"to_stage\":{\"id\":911877,\"name\":\"On-site interview\"}},\"offer\":{\"created_at\":\"2020-12-09T14:37:59.875608Z\",\"department\":null,\"id\":269122,\"kind\":\"job\",\"slug\":\"test-job\",\"tags\":[],\"title\":\"test job\",\"updated_at\":\"2020-12-09T14:38:17.539041Z\"}}}";
const VECTOR_SIGNATURE = '3b64e3049cb9e108fbb18a453e909cb4a32e3ae140ea01d84c2b5d316c19162f';

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function event(overrides = {}) {
  return JSON.stringify({
    id: 1,
    attempt_count: 1,
    created_at: '2020-12-11T23:50:56.168592Z',
    event_type: 'new_candidate',
    event_subtype: 'manual',
    payload: { candidate: { id: 21056, name: 'John Doe' }, company: { id: 1, name: 'Devtest Company' } },
    ...overrides,
  });
}

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/recruitee')
    .set('Content-Type', contentType)
    .set(headers)
    .send(body);
}

describe('verifyRecruiteeWebhook', () => {
  it('matches the test vector from the Recruitee docs', () => {
    expect(sign(VECTOR_BODY)).toBe(VECTOR_SIGNATURE);
    expect(verifyRecruiteeWebhook(Buffer.from(VECTOR_BODY), VECTOR_SIGNATURE, SECRET)).toBe(true);
  });

  it('rejects missing, malformed, and wrong-length signatures', () => {
    const body = Buffer.from(VECTOR_BODY);
    expect(verifyRecruiteeWebhook(body, undefined, SECRET)).toBe(false);
    expect(verifyRecruiteeWebhook(body, 'not-hex', SECRET)).toBe(false);
    expect(verifyRecruiteeWebhook(body, 'abcd', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/recruitee', () => {
  it('accepts the docs test vector', async () => {
    const res = await post(VECTOR_BODY, { 'X-Recruitee-Signature': VECTOR_SIGNATURE });
    expect(res.status).toBe(200);
  });

  it('accepts a valid signature for each event type', async () => {
    const cases = [
      ['new_candidate', 'career_site'],
      ['candidate_assigned', 'manual'],
      ['candidate_moved', 'stage_changed'],
      ['candidate_moved', 'disqualified'],
      ['candidate_moved', 'requalified'],
      ['candidate_deleted', 'manual'],
      ['offer_published', 'manual'],
      ['offer_unpublished', 'manual'],
      ['offer_updated', 'tags_changed'],
      ['something_new', 'manual'],
    ];
    for (const [event_type, event_subtype] of cases) {
      const body = event({ event_type, event_subtype });
      const res = await post(body, { 'X-Recruitee-Signature': sign(body) });
      expect(res.status).toBe(200);
    }
  });

  it('verifies regardless of content type', async () => {
    const body = event();
    const res = await post(body, { 'X-Recruitee-Signature': sign(body) }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature with 400', async () => {
    const res = await post(event(), { 'X-Recruitee-Signature': 'a'.repeat(64) });
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = event();
    const res = await post(body, { 'X-Recruitee-Signature': sign(body, 'other-secret') });
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = event();
    const res = await post(event({ id: 2 }), { 'X-Recruitee-Signature': sign(body) });
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature on a real event', async () => {
    const res = await post(event());
    expect(res.status).toBe(400);
  });

  it('returns 200 for the {"test":true} request, signed or not', async () => {
    const body = '{"test":true}';
    expect((await post(body)).status).toBe(200);
    expect((await post(body, { 'X-Recruitee-Signature': sign(body) })).status).toBe(200);
  });

  it('rejects an unsigned body that only looks like an event', async () => {
    const res = await post(JSON.stringify({ test: true, event_type: 'new_candidate' }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON with a valid signature', async () => {
    const body = 'not json';
    const res = await post(body, { 'X-Recruitee-Signature': sign(body) }, 'text/plain');
    expect(res.status).toBe(400);
  });
});
