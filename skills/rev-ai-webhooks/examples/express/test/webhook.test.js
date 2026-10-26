const request = require('supertest');

const CREDENTIAL = 'Bearer 7f3c9a1e-5b2d-4c68-8e0a-91d4b6c2f375';
process.env.REV_AI_AUTHORIZATION = CREDENTIAL;

const app = require('../src/index');
const { verifyRevAiRequest } = require('../src/index');

// Shapes taken from the Rev AI webhooks documentation
const transcribed = {
  job: {
    id: 'Umx5c6F7pH7r',
    status: 'transcribed',
    created_on: '2018-05-05T23:23:22.29Z',
    duration_seconds: 356.24,
  },
};
const failed = {
  job: {
    id: 'Umx5c6F7pH7r',
    status: 'failed',
    created_on: '2018-05-05T23:23:22.29Z',
    failure: 'download_failure',
    failure_detail: 'Failed to download media file. Please check your url and file type',
  },
};

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/rev-ai')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Rev AI webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value (transcribed)', async () => {
    const res = await post(transcribed, { Authorization: CREDENTIAL });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a failed job', async () => {
    const res = await post(failed, { Authorization: CREDENTIAL });
    expect(res.status).toBe(200);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(transcribed)).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    const res = await post(transcribed, { Authorization: 'Bearer wrong' });
    expect(res.status).toBe(401);
  });

  it('rejects the token without the scheme prefix', async () => {
    const res = await post(transcribed, { Authorization: CREDENTIAL.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('rejects a different scheme with the same token', async () => {
    const res = await post(transcribed, { Authorization: CREDENTIAL.replace('Bearer', 'Basic') });
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(transcribed), { Authorization: CREDENTIAL }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects before parsing: bad credential with invalid JSON is 401, not 400', async () => {
    const res = await post('not json', { Authorization: 'Bearer wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: CREDENTIAL })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post('[1,2]', { Authorization: CREDENTIAL })).status).toBe(400);
  });

  it('acknowledges unknown payloads and statuses with 200', async () => {
    expect((await post({ job: { id: 'x', status: 'in_progress' } }, { Authorization: CREDENTIAL })).status).toBe(200);
    expect((await post({ foo: 1 }, { Authorization: CREDENTIAL })).status).toBe(200);
  });

  it('handles non-ASCII credentials without throwing', () => {
    expect(verifyRevAiRequest({ authorization: 'Bearer ünï' }, { REV_AI_AUTHORIZATION: CREDENTIAL })).toBe(false);
  });

  it('never accepts when REV_AI_AUTHORIZATION is unset', () => {
    expect(verifyRevAiRequest({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyRevAiRequest({ authorization: '' }, { REV_AI_AUTHORIZATION: '' })).toBe(false);
  });
});
