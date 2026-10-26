const request = require('supertest');

const AUTH = 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=';
process.env.JOBADDER_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifyJobAdderRequest } = require('../src/index');

// Envelope from JobAdder's documented notification message
function envelope(event, extra = {}) {
  return {
    apiVersion: 2,
    event,
    eventId: '00000000-0000-0000-0000-000000000000',
    eventDate: '2019-01-01T09:00:00Z',
    eventUser: {},
    eventData: {},
    ...extra,
  };
}

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/jobadder')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('JobAdder webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await post(envelope('placement_approved'), { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(envelope('placement_approved'))).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    const res = await post(envelope('placement_approved'), { Authorization: 'Basic d3Jvbmc6d3Jvbmc=' });
    expect(res.status).toBe(401);
  });

  it('rejects the credential without its scheme prefix', async () => {
    const res = await post(envelope('placement_approved'), { Authorization: AUTH.replace('Basic ', '') });
    expect(res.status).toBe(401);
  });

  it('rejects the decoded username:password', async () => {
    const decoded = Buffer.from(AUTH.replace('Basic ', ''), 'base64').toString('utf8');
    const res = await post(envelope('placement_approved'), { Authorization: decoded });
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(envelope('job_status_changed')), { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: AUTH })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post('[1,2]', { Authorization: AUTH })).status).toBe(400);
  });

  it.each([
    'candidate_status_changed',
    'job_status_changed',
    'jobapplication_status_changed',
    'placement_approved',
    'interview_scheduled',
  ])('accepts %s', async (event) => {
    expect((await post(envelope(event), { Authorization: AUTH })).status).toBe(200);
  });

  it('never accepts when JOBADDER_AUTHORIZATION is unset', () => {
    expect(verifyJobAdderRequest({ authorization: 'Basic x' }, {})).toBe(false);
    expect(verifyJobAdderRequest({ authorization: '' }, { JOBADDER_AUTHORIZATION: '' })).toBe(false);
  });
});
