const request = require('supertest');

// Set test environment variables before importing the app
process.env.CYBERIMPACT_WEBHOOK_HEADER = 'Authorization';
process.env.CYBERIMPACT_WEBHOOK_SECRET = 'Bearer test_cyberimpact_secret_0123456789';

const app = require('../src/index');
const { verifyCyberimpactRequest } = require('../src/index');

const HEADER = 'Authorization';
const SECRET = process.env.CYBERIMPACT_WEBHOOK_SECRET;

const payload = (event = 'automation.webhook.send') => ({
  id: 'test_evt_GppedVq2CWTWxUUxrm26bic0C',
  event,
  timestamp: '2024-05-28T12:56:40Z',
  idClient: 3,
  data: { type: 'member', id: 54321, email: 'john.doe@example.org', firstname: 'John', lastname: 'Doe' },
});

function post({ headers = {}, body = JSON.stringify(payload()), type = 'application/json' } = {}) {
  return request(app).post('/webhooks/cyberimpact').set('Content-Type', type).set(headers).send(body);
}

describe('credential verification', () => {
  it('accepts the exact whole header value (including Bearer prefix)', async () => {
    const res = await post({ headers: { [HEADER]: SECRET } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('matches the header name case-insensitively', async () => {
    const res = await post({ headers: { authorization: SECRET } });
    expect(res.status).toBe(200);
  });

  it('does not strip a Bearer prefix', async () => {
    const res = await post({ headers: { [HEADER]: SECRET.replace('Bearer ', '') } });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong value of the same length', async () => {
    const res = await post({ headers: { [HEADER]: 'x'.repeat(SECRET.length) } });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong value of a different length', async () => {
    const res = await post({ headers: { [HEADER]: 'short' } });
    expect(res.status).toBe(401);
  });

  it('rejects a missing header', async () => {
    const res = await post();
    expect(res.status).toBe(401);
  });

  it('rejects the secret sent in a different header', async () => {
    const res = await post({ headers: { 'X-Other': SECRET } });
    expect(res.status).toBe(401);
  });

  it('reads a custom header name from CYBERIMPACT_WEBHOOK_HEADER', () => {
    const opts = { name: 'XSecret', secret: 's3cret' };
    expect(verifyCyberimpactRequest({ xsecret: 's3cret' }, opts)).toBe(true);
    expect(verifyCyberimpactRequest({ authorization: 's3cret' }, opts)).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    expect(verifyCyberimpactRequest({ authorization: SECRET }, { secret: '' })).toBe(false);
  });
});

describe('body handling', () => {
  it('accepts any content type', async () => {
    const res = await post({ headers: { [HEADER]: SECRET }, type: 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await post({ headers: { [HEADER]: SECRET }, body: '{not json' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-object body', async () => {
    const res = await post({ headers: { [HEADER]: SECRET }, body: '[1,2]' });
    expect(res.status).toBe(400);
  });

  it('checks the credential before parsing the body', async () => {
    const res = await post({ body: '{not json' });
    expect(res.status).toBe(401);
  });
});

describe('event handling', () => {
  it('handles automation.webhook.send', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const res = await post({ headers: { [HEADER]: SECRET } });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('54321'));
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
    spy.mockRestore();
  });

  it('acknowledges unknown events', async () => {
    const res = await post({ headers: { [HEADER]: SECRET }, body: JSON.stringify(payload('something.new')) });
    expect(res.status).toBe(200);
  });
});

describe('health', () => {
  it('responds ok', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
