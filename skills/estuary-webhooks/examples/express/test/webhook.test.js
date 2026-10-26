const request = require('supertest');

const SECRET = 'Bearer my-secret-token';
process.env.ESTUARY_WEBHOOK_SECRET = SECRET;
delete process.env.ESTUARY_WEBHOOK_HEADER; // default: Authorization

const app = require('../src/index');
const { verifyEstuaryRequest, classify } = require('../src/index');

// ILLUSTRATIVE payloads: Estuary has no fixed event schema. A trigger body is the
// author's payloadTemplate; these use the documented template variables.
const trigger = {
  materialization_name: 'acmeCo/orders/to-warehouse',
  collection_names: ['acmeCo/orders'],
  run_id: 'run-0001',
};
const document = { id: 42, status: 'shipped' };

function send(method, { body, headers = {}, contentType = 'application/json' } = {}) {
  let req = request(app)[method]('/webhooks/estuary').set(headers);
  if (body !== undefined) {
    req = req.set('Content-Type', contentType).send(typeof body === 'string' ? body : JSON.stringify(body));
  }
  return req;
}

describe('Estuary webhook', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.ESTUARY_WEBHOOK_HEADER;
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(['post', 'put', 'patch'])('accepts %s with the whole Authorization value', async (method) => {
    const res = await send(method, { body: trigger, headers: { Authorization: SECRET } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each(['get', 'delete'])('accepts %s with an empty body', async (method) => {
    const res = await send(method, { headers: { Authorization: SECRET } });
    expect(res.status).toBe(200);
  });

  it.each(['get', 'post', 'put', 'patch', 'delete'])('rejects %s without the header', async (method) => {
    expect((await send(method, { body: trigger })).status).toBe(401);
  });

  it('rejects a wrong value', async () => {
    const res = await send('post', { body: trigger, headers: { Authorization: 'Bearer nope' } });
    expect(res.status).toBe(401);
  });

  it('does not strip a Bearer prefix', async () => {
    const res = await send('post', { body: trigger, headers: { Authorization: 'my-secret-token' } });
    expect(res.status).toBe(401);
  });

  it('rejects a longer value that starts with the secret', async () => {
    const res = await send('post', { body: trigger, headers: { Authorization: `${SECRET}x` } });
    expect(res.status).toBe(401);
  });

  it('reads the header name from ESTUARY_WEBHOOK_HEADER, case-insensitively', async () => {
    process.env.ESTUARY_WEBHOOK_HEADER = 'X-Estuary-Secret';
    const ok = await send('post', { body: trigger, headers: { 'x-estuary-secret': SECRET } });
    expect(ok.status).toBe(200);
    const wrongHeader = await send('post', { body: trigger, headers: { Authorization: SECRET } });
    expect(wrongHeader.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await send('post', {
      body: JSON.stringify(document), headers: { Authorization: SECRET }, contentType: 'text/plain',
    });
    expect(res.status).toBe(200);
  });

  it('accepts a non-JSON body once authenticated', async () => {
    const res = await send('post', { body: 'plain text', headers: { Authorization: SECRET }, contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('classifies payloads', () => {
    expect(classify(trigger)).toBe('trigger');
    expect(classify(document)).toBe('document');
    expect(classify(null)).toBe('empty');
  });

  it('never accepts when ESTUARY_WEBHOOK_SECRET is unset', () => {
    expect(verifyEstuaryRequest({ authorization: 'x' }, {})).toBe(false);
    expect(verifyEstuaryRequest({ authorization: '' }, { ESTUARY_WEBHOOK_SECRET: '' })).toBe(false);
  });
});
