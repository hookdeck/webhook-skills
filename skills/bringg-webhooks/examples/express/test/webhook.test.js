const request = require('supertest');

const SECRET = 'Bearer test_bringg_static_header_0123456789';

process.env.BRINGG_WEBHOOK_SECRET = SECRET;
process.env.BRINGG_WEBHOOK_HEADER = 'Authorization';

const app = require('../src/index');
const { verifyBringgRequest } = require('../src/index');

// Shape of a Bringg order webhook (abridged)
function samplePayload(type = 'task_created') {
  return { webhook_type: type, id: 8503585, title: '50 cases of Best Brand Soda', status: 0 };
}

function post(headers = {}, body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/bringg')
    .set('Content-Type', contentType)
    .set(headers)
    .send(body);
}

describe('POST /webhooks/bringg', () => {
  beforeEach(() => {
    process.env.BRINGG_WEBHOOK_SECRET = SECRET;
    process.env.BRINGG_WEBHOOK_HEADER = 'Authorization';
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts the exact header value, including the Bearer prefix', async () => {
    const res = await post({ Authorization: SECRET });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('does not strip a Bearer prefix: the bare token is rejected', async () => {
    const res = await post({ Authorization: SECRET.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong value of the same length', async () => {
    const wrong = SECRET.slice(0, -1) + 'x';
    expect((await post({ Authorization: wrong })).status).toBe(401);
  });

  it('rejects a wrong value of a different length', async () => {
    expect((await post({ Authorization: SECRET + 'extra' })).status).toBe(401);
  });

  it('rejects a missing header', async () => {
    expect((await post()).status).toBe(401);
  });

  it('rejects everything when no secret is configured', async () => {
    delete process.env.BRINGG_WEBHOOK_SECRET;
    expect((await post({ Authorization: '' })).status).toBe(401);
    expect((await post({ Authorization: 'undefined' })).status).toBe(401);
  });

  it('reads a custom header name case-insensitively', async () => {
    process.env.BRINGG_WEBHOOK_HEADER = 'Application-Key';
    process.env.BRINGG_WEBHOOK_SECRET = 'abc123-static-key';
    expect((await post({ 'application-key': 'abc123-static-key' })).status).toBe(200);
    expect((await post({ 'APPLICATION-KEY': 'abc123-static-key' })).status).toBe(200);
    // The default Authorization header no longer counts
    expect((await post({ Authorization: 'abc123-static-key' })).status).toBe(401);
  });

  it('handles non-ASCII secrets', async () => {
    process.env.BRINGG_WEBHOOK_SECRET = 'sécret-ключ';
    expect(verifyBringgRequest({ authorization: 'sécret-ключ' })).toBe(true);
    expect(verifyBringgRequest({ authorization: 'secret-ключ' })).toBe(false);
  });

  it('accepts a JSON body sent with any content type', async () => {
    const res = await post({ Authorization: SECRET }, JSON.stringify(samplePayload()), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('authenticates before parsing: bad credentials with bad JSON is 401, not 400', async () => {
    expect((await post({ Authorization: 'nope' }, 'not json')).status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post({ Authorization: SECRET }, 'not json')).status).toBe(400);
  });

  it('returns 400 for a non-object body', async () => {
    expect((await post({ Authorization: SECRET }, '[1,2]')).status).toBe(400);
  });

  describe('event dispatch', () => {
    const events = [
      'task_created',
      'task_done',
      'task_cancelled',
      'driver_assigned',
      'way_point_arrived',
      'note_created',
    ];

    it.each(events)('handles %s', async (type) => {
      const res = await post({ Authorization: SECRET }, JSON.stringify(samplePayload(type)));
      expect(res.status).toBe(200);
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled event'));
    });

    it('logs unknown events and still returns 200', async () => {
      const res = await post({ Authorization: SECRET }, JSON.stringify(samplePayload('scan_created')));
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Unhandled event: scan_created');
    });
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
