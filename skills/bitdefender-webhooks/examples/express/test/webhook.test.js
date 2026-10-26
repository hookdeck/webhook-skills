const request = require('supertest');

const AUTH = 'Bearer sfasdfw34243';
process.env.BITDEFENDER_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifyBitdefenderRequest } = require('../src/index');

// Shapes from the Bitdefender "Push event JSON RPC messages" docs (trimmed)
const av = {
  module: 'av',
  companyId: '63920a01070088b57f0be1d2',
  computer_name: 'IRU-WIN10X64-A',
  malware_type: 'file',
  malware_name: 'EICAR-Test-File (not a virus)',
  final_status: 'quarantined',
};
const aph = {
  module: 'aph',
  computer_name: 'FC-EXCHANGE-01',
  aph_type: 'phishing',
  url: 'http://example.com/account/support/',
  status: 'aph_blocked',
};
const rpc = (events) => ({ jsonrpc: '2.0', method: 'addEvents', params: { events }, id: 1694701009244 });

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/bitdefender')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Bitdefender webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await post(rpc([av, aph]), { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(rpc([av]))).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    expect((await post(rpc([av]), { Authorization: 'Bearer nope' })).status).toBe(401);
  });

  it('rejects the credential without its "Bearer " prefix', async () => {
    expect((await post(rpc([av]), { Authorization: AUTH.replace('Bearer ', '') })).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(rpc([av])), { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: AUTH })).status).toBe(400);
  });

  it('returns 400 when params.events is missing', async () => {
    const res = await post({ jsonrpc: '2.0', method: 'addEvents', params: {}, id: 1 }, { Authorization: AUTH });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a different JSON-RPC method', async () => {
    const res = await post({ jsonrpc: '2.0', method: 'other', params: { events: [] }, id: 1 }, { Authorization: AUTH });
    expect(res.status).toBe(400);
  });

  it('accepts unknown modules', async () => {
    const res = await post(rpc([{ module: 'something-new' }]), { Authorization: AUTH });
    expect(res.status).toBe(200);
  });

  it('never accepts when BITDEFENDER_AUTHORIZATION is unset', () => {
    expect(verifyBitdefenderRequest({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyBitdefenderRequest({ authorization: '' }, { BITDEFENDER_AUTHORIZATION: '' })).toBe(false);
  });
});
