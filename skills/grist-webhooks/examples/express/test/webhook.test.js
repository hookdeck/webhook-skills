const request = require('supertest');

const CREDENTIAL = 'Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516';
process.env.GRIST_AUTHORIZATION = CREDENTIAL;

const app = require('../src/index');
const { verifyGristRequest } = require('../src/index');

// Shape taken from Grist's documented sample payload (trimmed): a JSON array of rows
const rows = [
  { id: 29, manualSort: 29, Title: 'Trophy', Price: 60, Purchase_status: 'wishlisted' },
  { id: 24, manualSort: 24, Title: 'Dataman', Price: 50, Purchase_status: 'own digitally' },
];

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/grist')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Grist webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await post(rows, { Authorization: CREDENTIAL });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, rows: 2 });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(rows)).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    const res = await post(rows, { Authorization: 'Bearer 00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await post(rows, { Authorization: CREDENTIAL.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('does not strip or parse the scheme', async () => {
    const res = await post(rows, { Authorization: CREDENTIAL.replace('Bearer', 'Basic') });
    expect(res.status).toBe(401);
  });

  it('accepts a Basic-prefixed value compared whole', async () => {
    const basic = 'Basic dXNlcjpwYXNz';
    process.env.GRIST_AUTHORIZATION = basic;
    try {
      expect((await post(rows, { Authorization: basic })).status).toBe(200);
    } finally {
      process.env.GRIST_AUTHORIZATION = CREDENTIAL;
    }
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(rows), { Authorization: CREDENTIAL }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('accepts an empty array', async () => {
    expect((await post([], { Authorization: CREDENTIAL })).status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: CREDENTIAL })).status).toBe(400);
  });

  it('returns 400 for a JSON object instead of an array', async () => {
    expect((await post({ id: 1 }, { Authorization: CREDENTIAL })).status).toBe(400);
  });

  it('returns 400 for an array of non-objects', async () => {
    expect((await post('[1,2]', { Authorization: CREDENTIAL })).status).toBe(400);
  });

  it('never accepts when GRIST_AUTHORIZATION is unset', () => {
    expect(verifyGristRequest({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyGristRequest({ authorization: '' }, { GRIST_AUTHORIZATION: '' })).toBe(false);
  });
});
