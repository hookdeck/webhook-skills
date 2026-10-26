const request = require('supertest');

const AUTH = 'Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516';
process.env.ITERABLE_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifyIterableRequest } = require('../src/index');

// Shapes taken from Iterable's documented example payloads (trimmed)
const emailSend = {
  email: 'user@example.com',
  eventName: 'emailSend',
  dataFields: { campaignId: 59667, messageId: '9c438a20d26e4e9f8ad4edea23f811cd', emailSubject: 'My subject' },
};
const emailOpen = { email: 'user@example.com', eventName: 'emailOpen', dataFields: { campaignId: 49313, isBot: false } };
const emailBounce = { email: 'user@example.com', eventName: 'emailBounce', dataFields: { recipientState: 'HardBounce' } };
const emailUnSubscribe = { email: 'user@example.com', eventName: 'emailUnSubscribe', dataFields: { unsubSource: 'EmailLink' } };

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/iterable')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Iterable webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Bearer Authorization value (OAuth 2.0)', async () => {
    const res = await post(emailSend, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a Basic value compared as-is, never decoded', async () => {
    process.env.ITERABLE_AUTHORIZATION = 'Basic abc123'; // not valid base64 user:pass, still fine
    expect((await post(emailSend, { Authorization: 'Basic abc123' })).status).toBe(200);
    expect((await post(emailSend, { Authorization: 'Basic YWJjMTIz' })).status).toBe(401);
    process.env.ITERABLE_AUTHORIZATION = AUTH;
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(emailSend)).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    const res = await post(emailSend, { Authorization: 'Bearer 00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(401);
  });

  it('rejects the token without the Bearer prefix', async () => {
    const res = await post(emailSend, { Authorization: AUTH.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('rejects non-ASCII and different-length values without throwing', async () => {
    expect((await post(emailSend, { Authorization: 'Bearer short' })).status).toBe(401);
    expect(verifyIterableRequest({ authorization: 'Bearer éé' }, { ITERABLE_AUTHORIZATION: AUTH })).toBe(false);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(emailOpen), { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects before parsing: bad credential with invalid JSON is 401, not 400', async () => {
    expect((await post('not json')).status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: AUTH })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post('[1,2]', { Authorization: AUTH })).status).toBe(400);
  });

  it('accepts documented event names, including unknown ones', async () => {
    for (const body of [emailOpen, emailBounce, emailUnSubscribe, { eventName: 'journeyExit', email: 'a@b.co' }]) {
      expect((await post(body, { Authorization: AUTH })).status).toBe(200);
    }
  });

  it('never accepts when ITERABLE_AUTHORIZATION is unset', () => {
    expect(verifyIterableRequest({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyIterableRequest({ authorization: '' }, { ITERABLE_AUTHORIZATION: '' })).toBe(false);
  });
});
