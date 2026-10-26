const request = require('supertest');

const AUTH = 'Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516';
process.env.YOUMAIL_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifyYouMailRequest, classify } = require('../src/index');

// Shapes taken from the payload schemas in YouMail's OpenAPI spec (trimmed)
const callEvents = { callEvents: [{ callEventUuid: 'a1b2c3', callResult: 'BLOCKED', originator: {}, destination: {} }] };
const phoneInsights = { callVolumeSummaries: [{ callingPhoneNumber: '+15555550100', destinationCarriers: [] }] };
const tnReport = {
  tnReportUuid: 'f0e1d2',
  phoneNumber: '+15555550100',
  status: 'MITIGATED',
  statusChangeTime: 1760000000000,
};
const scoreThreshold = {
  phoneNumber: '+15555550100',
  oldSpamScore: 0.4,
  newSpamScore: 0.9,
  createdDate: '2026-10-25T12:00:00Z',
};

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/youmail')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('YouMail webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await post(callEvents, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(callEvents)).status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const res = await post(callEvents, { Authorization: 'Bearer 00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await post(callEvents, { Authorization: AUTH.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('rejects a Basic credential', async () => {
    const res = await post(callEvents, { Authorization: 'Basic dXNlcjpwYXNz' });
    expect(res.status).toBe(401);
  });

  it('rejects a value of a different length without throwing', async () => {
    expect((await post(callEvents, { Authorization: 'Bearer x' })).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(tnReport), { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: AUTH })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post('[1,2]', { Authorization: AUTH })).status).toBe(400);
  });

  it('accepts every documented payload shape', async () => {
    for (const body of [callEvents, phoneInsights, tnReport, scoreThreshold]) {
      expect((await post(body, { Authorization: AUTH })).status).toBe(200);
    }
  });

  it('classifies payloads by top-level keys', () => {
    expect(classify(callEvents)).toBe('CALL_EVENT');
    expect(classify(phoneInsights)).toBe('PHONE_INSIGHTS');
    expect(classify(tnReport)).toBe('PROVIDER_TN_REPORT_STATUS');
    expect(classify(scoreThreshold)).toBe('WATCHLIST_SCORE_THRESHOLD');
    expect(classify({ foo: 1 })).toBeNull();
  });

  it('never accepts when YOUMAIL_AUTHORIZATION is unset', () => {
    expect(verifyYouMailRequest({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyYouMailRequest({ authorization: '' }, { YOUMAIL_AUTHORIZATION: '' })).toBe(false);
  });
});
