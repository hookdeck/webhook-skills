const request = require('supertest');

// Format from the Procore docs: a token, not base64 user:pass. Never decoded.
const AUTH = 'Basic c3a24b8208ac5199d083d54a1234e94b8864';
process.env.PROCORE_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifyProcoreRequest } = require('../src/index');

// Illustrative v2 payload; field names are not confirmed against the developer docs
const payload = (eventType) => ({
  id: 'evt_1',
  ulid: '01H8XYZ0000000000000000000',
  timestamp: '2026-10-25T12:00:00Z',
  user_id: 42,
  company_id: 1001,
  project_id: 2002,
  api_version: 'v2',
  event_type: eventType,
  resource_name: 'RFIs',
  resource_id: 3003,
});

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/procore')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Procore webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await post(payload('create'), { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(payload('create'))).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    const res = await post(payload('create'), { Authorization: 'Basic 0000' });
    expect(res.status).toBe(401);
  });

  it('rejects the token without the scheme prefix (no stripping)', async () => {
    const res = await post(payload('create'), { Authorization: AUTH.replace('Basic ', '') });
    expect(res.status).toBe(401);
  });

  it('rejects a different scheme prefix', async () => {
    const res = await post(payload('create'), { Authorization: AUTH.replace('Basic', 'Bearer') });
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(payload('update')), { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('handles create, update and delete', async () => {
    for (const type of ['create', 'update', 'delete']) {
      expect((await post(payload(type), { Authorization: AUTH })).status).toBe(200);
    }
  });

  it('returns 200 for an unknown event_type', async () => {
    expect((await post(payload('other'), { Authorization: AUTH })).status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: AUTH })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post('[1,2]', { Authorization: AUTH })).status).toBe(400);
  });

  it('never accepts when PROCORE_AUTHORIZATION is unset', () => {
    expect(verifyProcoreRequest({ authorization: 'x' }, {})).toBe(false);
    expect(verifyProcoreRequest({ authorization: '' }, { PROCORE_AUTHORIZATION: '' })).toBe(false);
  });
});
