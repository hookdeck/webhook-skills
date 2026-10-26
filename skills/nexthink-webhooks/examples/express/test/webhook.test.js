const request = require('supertest');

const AUTH = 'Bearer 7f3c9a1e-5b2d-4e68-8a40-d1c2b3a49586';
process.env.NEXTHINK_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifyNexthinkRequest } = require('../src/index');

// Illustrative template: Nexthink adds no event field; "event" is chosen by the template author
const triggered = { event: 'alert triggered', monitor: 'High CPU (illustrative)' };
const recovered = { event: 'alert recovered', monitor: 'High CPU (illustrative)' };

function send(method, body, headers = {}, contentType = 'application/json') {
  const req = request(app)[method]('/webhooks/nexthink').set(headers);
  if (body === undefined) return req;
  return req
    .set('Content-Type', contentType)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Nexthink webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await send('post', triggered, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each(['post', 'put', 'patch'])('accepts %s', async (method) => {
    const res = await send(method, recovered, { Authorization: AUTH });
    expect(res.status).toBe(200);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await send('post', triggered)).status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const res = await send('post', triggered, { Authorization: 'Bearer wrong-token' });
    expect(res.status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await send('post', triggered, { Authorization: AUTH.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('rejects wrong credentials on PUT and PATCH too', async () => {
    expect((await send('put', triggered, { Authorization: 'Bearer nope' })).status).toBe(401);
    expect((await send('patch', triggered)).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await send('post', JSON.stringify(triggered), { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('accepts an empty body', async () => {
    const res = await send('post', undefined, { Authorization: AUTH });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await send('post', 'not json', { Authorization: AUTH });
    expect(res.status).toBe(400);
  });

  it('accepts a payload with no recognised event', async () => {
    const res = await send('post', { foo: 'bar' }, { Authorization: AUTH });
    expect(res.status).toBe(200);
  });

  it('never accepts when NEXTHINK_AUTHORIZATION is unset', () => {
    expect(verifyNexthinkRequest({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyNexthinkRequest({ authorization: '' }, { NEXTHINK_AUTHORIZATION: '' })).toBe(false);
  });
});
