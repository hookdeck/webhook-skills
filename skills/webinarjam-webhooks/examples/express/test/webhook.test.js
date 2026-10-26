const request = require('supertest');

const SECRET = 'Bearer wj_test_3f9a1c7e5b2d4086';

process.env.WEBINARJAM_WEBHOOK_SECRET = SECRET;
delete process.env.WEBINARJAM_WEBHOOK_HEADER; // default: Authorization

const app = require('../src/index');
const { verifyWebinarJamRequest } = require('../src/index');

// Illustrative payload: WebinarJam does not document field names.
const lead = {
  event: 'registered',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  phone: '+15555550100',
  live_room_link: 'https://example.com/live',
  replay_link: 'https://example.com/replay',
  unsubscribe_link: 'https://example.com/unsubscribe',
};

function post(body = JSON.stringify(lead), headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/webinarjam')
    .set('Content-Type', contentType)
    .set(headers)
    .send(body);
}

describe('WebinarJam webhook (Express)', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the whole Authorization header value', async () => {
    const res = await post(undefined, { Authorization: SECRET });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing header', async () => {
    expect((await post()).status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    expect((await post(undefined, { Authorization: 'Bearer nope' })).status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix (whole value is compared)', async () => {
    expect((await post(undefined, { Authorization: SECRET.replace('Bearer ', '') })).status).toBe(401);
  });

  it('rejects a longer value without throwing', async () => {
    expect((await post(undefined, { Authorization: SECRET + 'x' })).status).toBe(401);
  });

  it('accepts any content type and parses the body only after the check', async () => {
    const res = await post(JSON.stringify(lead), { Authorization: SECRET }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON once authenticated', async () => {
    expect((await post('not json', { Authorization: SECRET })).status).toBe(400);
  });

  it('returns 400 for a non-object body', async () => {
    expect((await post('[1]', { Authorization: SECRET })).status).toBe(400);
  });

  it.each(['registered', 'attended_live', 'missed_live', 'left_early', 'purchased', 'other'])(
    'handles the %s trigger',
    async (event) => {
      const res = await post(JSON.stringify({ ...lead, event }), { Authorization: SECRET });
      expect(res.status).toBe(200);
    }
  );

  it('returns 500 when no secret is configured', async () => {
    delete process.env.WEBINARJAM_WEBHOOK_SECRET;
    try {
      expect((await post(undefined, { Authorization: SECRET })).status).toBe(500);
    } finally {
      process.env.WEBINARJAM_WEBHOOK_SECRET = SECRET;
    }
  });
});

describe('verifyWebinarJamRequest', () => {
  it('reads a custom header name, case-insensitively', () => {
    const config = { WEBINARJAM_WEBHOOK_HEADER: 'X-Webinar-Key', WEBINARJAM_WEBHOOK_SECRET: 'abc123' };
    expect(verifyWebinarJamRequest({ 'x-webinar-key': 'abc123' }, config)).toBe(true);
    expect(verifyWebinarJamRequest({ 'x-webinar-key': 'abc124' }, config)).toBe(false);
    expect(verifyWebinarJamRequest({ authorization: 'abc123' }, config)).toBe(false);
  });

  it('never matches when the secret is unset or the header is empty', () => {
    expect(verifyWebinarJamRequest({ authorization: '' }, {})).toBe(false);
    expect(verifyWebinarJamRequest({ authorization: '' }, { WEBINARJAM_WEBHOOK_SECRET: '' })).toBe(false);
  });
});
