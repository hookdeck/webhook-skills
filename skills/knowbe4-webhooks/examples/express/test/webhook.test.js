const request = require('supertest');

const SECRET = 'Bearer 7f3c9a1e5b2d4086a9c1e3f5071b2d4c';
process.env.KNOWBE4_WEBHOOK_SECRET = SECRET;
delete process.env.KNOWBE4_WEBHOOK_HEADER; // default: Authorization

const app = require('../src/index');
const { verifyKnowbe4Request } = require('../src/index');

// ILLUSTRATIVE payload: KnowBe4 documents no body schema or event field.
const payload = {
  event_type: 'Phish Failure Removed',
  System: 'KnowBe4', // an admin-defined Custom Data key/value
};

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/knowbe4')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('KnowBe4 webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the whole Authorization value, Bearer prefix included', async () => {
    const res = await post(payload, { Authorization: SECRET });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('looks the header up case-insensitively', async () => {
    const res = await post(payload, { authorization: SECRET });
    expect(res.status).toBe(200);
  });

  it('rejects a missing header', async () => {
    const res = await post(payload);
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const res = await post(payload, { Authorization: 'Bearer wrong' });
    expect(res.status).toBe(401);
  });

  it('does not strip the Bearer prefix', async () => {
    const res = await post(payload, { Authorization: SECRET.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('rejects a longer value that starts with the secret', async () => {
    const res = await post(payload, { Authorization: `${SECRET}x` });
    expect(res.status).toBe(401);
  });

  it('authenticates before parsing: bad JSON without the header is 401, not 400', async () => {
    const res = await post('not json');
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON once authenticated', async () => {
    const res = await post('not json', { Authorization: SECRET });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array body', async () => {
    const res = await post([1, 2], { Authorization: SECRET });
    expect(res.status).toBe(400);
  });

  it('accepts any content type', async () => {
    const res = await post(payload, { Authorization: SECRET }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('handles a payload with no event_type', async () => {
    const res = await post({ System: 'PhishER' }, { Authorization: SECRET });
    expect(res.status).toBe(200);
  });

  it('exposes a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });

  describe('verifyKnowbe4Request', () => {
    it('reads the header name from config', () => {
      const config = { KNOWBE4_WEBHOOK_HEADER: 'X-KnowBe4-Key', KNOWBE4_WEBHOOK_SECRET: 'abc123' };
      expect(verifyKnowbe4Request({ 'x-knowbe4-key': 'abc123' }, config)).toBe(true);
      expect(verifyKnowbe4Request({ authorization: 'abc123' }, config)).toBe(false);
    });

    it('fails closed when the secret is unset', () => {
      expect(verifyKnowbe4Request({ authorization: 'undefined' }, {})).toBe(false);
      expect(verifyKnowbe4Request({ authorization: '' }, {})).toBe(false);
    });

    it('handles non-ASCII values without throwing', () => {
      expect(verifyKnowbe4Request({ authorization: 'sécrèt✓' }, { KNOWBE4_WEBHOOK_SECRET: 'sécrèt✓' })).toBe(true);
      expect(verifyKnowbe4Request({ authorization: 'secret' }, { KNOWBE4_WEBHOOK_SECRET: 'sécrèt✓' })).toBe(false);
    });
  });
});
