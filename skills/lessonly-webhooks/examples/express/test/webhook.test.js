const request = require('supertest');

const AUTH = 'Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516';
process.env.LESSONLY_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifyLessonlyRequest } = require('../src/index');

// ILLUSTRATIVE lesson-completed body: Lessonly does not document the payload
const lessonCompleted = {
  lesson_id: 1234,
  user_id: 5678,
  completed_at: '2026-10-25T12:00:00Z',
};

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/lessonly')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Lessonly webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await post(lessonCompleted, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(lessonCompleted)).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    const res = await post(lessonCompleted, { Authorization: 'Bearer 00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await post(lessonCompleted, { Authorization: AUTH.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('does not strip or add a scheme', async () => {
    const res = await post(lessonCompleted, { Authorization: `Basic ${AUTH.replace('Bearer ', '')}` });
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(lessonCompleted), { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 401 before parsing an invalid body without credentials', async () => {
    expect((await post('not json')).status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: AUTH })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post('[1,2]', { Authorization: AUTH })).status).toBe(400);
  });

  it('never accepts when LESSONLY_AUTHORIZATION is unset', () => {
    expect(verifyLessonlyRequest({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyLessonlyRequest({ authorization: '' }, { LESSONLY_AUTHORIZATION: '' })).toBe(false);
  });

  it('handles non-ASCII values without throwing', () => {
    expect(verifyLessonlyRequest({ authorization: 'Bearer é' }, { LESSONLY_AUTHORIZATION: 'Bearer é' })).toBe(true);
    expect(verifyLessonlyRequest({ authorization: 'Bearer e' }, { LESSONLY_AUTHORIZATION: 'Bearer é' })).toBe(false);
  });
});
