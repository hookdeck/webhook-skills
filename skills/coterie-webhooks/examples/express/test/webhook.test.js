const request = require('supertest');

const TOKEN = 'token 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516';
process.env.COTERIE_AUTHENTICATION = TOKEN;

const app = require('../src/index');
const { verifyCoterieRequest, classify } = require('../src/index');

// Shapes taken from Coterie's documented sample payloads (trimmed)
const application = {
  applicationId: '83857350-4bfb-4669-862c-61f05a7a4be9',
  Status: 'ReadyToQuote',
  BusinessName: 'Test The link',
  ApplicationTypes: ['PL', 'BOP'],
};
const quote = {
  quoteId: '323d6e60-cb75-4098-af71-a643d8f47dba',
  PolicyType: 'BOP',
  Premium: 2699,
  applicationId: '83857350-4bfb-4669-862c-61f05a7a4be9',
};
const policy = {
  PolicyId: 'b6a4f634-a78f-40a2-bede-8bd352435d19',
  PolicyNumber: 'CSANDSB-00080305-00',
  Status: 'Pending',
  PolicyType: 'BOP',
};

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/coterie')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Coterie webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authentication header value', async () => {
    const res = await post(application, { Authentication: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authentication header', async () => {
    const res = await post(application);
    expect(res.status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const res = await post(application, { Authentication: 'token 00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(401);
  });

  it('rejects the guid without the "token " prefix', async () => {
    const res = await post(application, { Authentication: TOKEN.replace('token ', '') });
    expect(res.status).toBe(401);
  });

  it('does not accept the Authorization header', async () => {
    const res = await post(application, { Authorization: TOKEN });
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(policy), { Authentication: TOKEN }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await post('not json', { Authentication: TOKEN });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    const res = await post('[1,2]', { Authentication: TOKEN });
    expect(res.status).toBe(400);
  });

  it('accepts quote and policy payloads', async () => {
    expect((await post(quote, { Authentication: TOKEN })).status).toBe(200);
    expect((await post(policy, { Authentication: TOKEN })).status).toBe(200);
  });

  it('classifies payloads by identifier key', () => {
    expect(classify(application)).toBe('application');
    expect(classify(quote)).toBe('quote');
    expect(classify(policy)).toBe('policy');
    expect(classify({ foo: 1 })).toBeNull();
  });

  it('never accepts when COTERIE_AUTHENTICATION is unset', () => {
    expect(verifyCoterieRequest({ authentication: 'token x' }, {})).toBe(false);
    expect(verifyCoterieRequest({ authentication: '' }, { COTERIE_AUTHENTICATION: '' })).toBe(false);
  });
});
