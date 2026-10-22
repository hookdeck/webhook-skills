const request = require('supertest');

const USERNAME = 'proxyclick';
const PASSWORD = 'p@ss:word-with-colon';
process.env.PROXYCLICK_WEBHOOK_USERNAME = USERNAME;
process.env.PROXYCLICK_WEBHOOK_PASSWORD = PASSWORD;

const app = require('../src/index');
const { verifyProxyclickRequest, parseBasicAuth } = require('../src/index');

// ILLUSTRATIVE body: Proxyclick's attribute reference is not documented here, so
// this is NOT its real schema. Only the Basic credential check is under test.
const illustrative = { visitor: { firstName: 'Ada' }, visit: { id: 'illustrative-1' } };

const basic = (user, pass) => 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/proxyclick')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Proxyclick webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts correct Basic credentials', async () => {
    const res = await post(illustrative, { Authorization: basic(USERNAME, PASSWORD) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a lowercase scheme and a password containing colons', async () => {
    const res = await post(illustrative, { Authorization: basic(USERNAME, PASSWORD).replace('Basic', 'basic') });
    expect(res.status).toBe(200);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(illustrative)).status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    expect((await post(illustrative, { Authorization: basic(USERNAME, 'nope') })).status).toBe(401);
  });

  it('rejects a wrong username', async () => {
    expect((await post(illustrative, { Authorization: basic('other', PASSWORD) })).status).toBe(401);
  });

  it('rejects a non-Basic scheme', async () => {
    expect((await post(illustrative, { Authorization: `Bearer ${PASSWORD}` })).status).toBe(401);
  });

  it('rejects malformed base64 and credentials without a colon', async () => {
    expect((await post(illustrative, { Authorization: 'Basic !!!notbase64' })).status).toBe(401);
    const noColon = 'Basic ' + Buffer.from('justausername').toString('base64');
    expect((await post(illustrative, { Authorization: noColon })).status).toBe(401);
  });

  it('does not send a WWW-Authenticate challenge', async () => {
    const res = await post(illustrative);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(illustrative), { Authorization: basic(USERNAME, PASSWORD) }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON and for a JSON array', async () => {
    const auth = { Authorization: basic(USERNAME, PASSWORD) };
    expect((await post('not json', auth)).status).toBe(400);
    expect((await post('[1,2]', auth)).status).toBe(400);
  });

  it('parses credentials on the first colon', () => {
    expect(parseBasicAuth(basic('a', 'b:c'))).toEqual({ username: 'a', password: 'b:c' });
    expect(parseBasicAuth(undefined)).toBeNull();
  });

  it('never accepts when credentials are unset', () => {
    const headers = { authorization: basic('', '') };
    expect(verifyProxyclickRequest(headers, {})).toBe(false);
    expect(verifyProxyclickRequest({ authorization: basic(USERNAME, PASSWORD) }, { PROXYCLICK_WEBHOOK_USERNAME: USERNAME })).toBe(false);
  });
});
