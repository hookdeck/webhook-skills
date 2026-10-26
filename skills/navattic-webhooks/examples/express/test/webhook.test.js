const request = require('supertest');

const CREDENTIAL = 'Bearer 1b2c3d4e5f6047189a0bc1d2e3f40516';
process.env.NAVATTIC_AUTHORIZATION = CREDENTIAL;

const app = require('../src/index');
const { verifyNavatticRequest, classifyData } = require('../src/index');

// Shapes taken from Navattic's documented session_closed examples (trimmed)
const companyAccount = {
  id: 'clx8f4iii0011abcd12345678',
  createdAt: '2026-06-01T09:14:00.000Z',
  updatedAt: '2026-07-14T18:32:05.000Z',
  workspaceId: 'clx8ezzzz0000abcd12345678',
  name: 'Example Corp',
  websiteDomain: 'example.com',
  engaged: true,
  employeeCount: 250,
  customPropertyValues: [],
};
const visitor = {
  eventType: 'session_closed',
  timestamp: '2026-07-14T18:32:05.000Z',
  data: {
    session: {
      type: 'INTERACTIVE_DEMO',
      recordedGuideSessionId: 'clx8f2k1a0003abcd12345678',
      createdAt: '2026-07-14T18:20:11.000Z',
      closedAt: '2026-07-14T18:32:05.000Z',
      mostRecentDemoName: 'Acme Product Tour',
      recordedEvents: [{ id: 'clx8f3xyz0004abcd12345678', type: 'VIEW_STEP', recordedStepName: 'Welcome' }],
    },
    endUser: { id: 'clx8f1hhh0010abcd12345678', mostRecentEmail: 'jane.doe@example.com', mostRecentName: 'Jane Doe' },
    companyAccount,
  },
};
const account = {
  eventType: 'session_closed',
  timestamp: '2026-07-14T18:32:05.000Z',
  data: companyAccount,
};

function send(method, body, headers = {}, contentType = 'application/json') {
  let req = request(app)[method]('/webhooks/navattic').set(headers);
  if (body !== undefined) {
    req = req.set('Content-Type', contentType).send(typeof body === 'string' ? body : JSON.stringify(body));
  }
  return req;
}

describe('Navattic webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value (Bearer)', async () => {
    const res = await send('post', visitor, { Authorization: CREDENTIAL });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a Basic credential compared as a whole string, without decoding it', async () => {
    const basic = `Basic ${Buffer.from('user:pa:ss').toString('base64')}`;
    process.env.NAVATTIC_AUTHORIZATION = basic;
    try {
      expect((await send('post', visitor, { Authorization: basic })).status).toBe(200);
      expect((await send('post', visitor, { Authorization: CREDENTIAL })).status).toBe(401);
    } finally {
      process.env.NAVATTIC_AUTHORIZATION = CREDENTIAL;
    }
  });

  it('rejects a missing Authorization header', async () => {
    expect((await send('post', visitor)).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    expect((await send('post', visitor, { Authorization: 'Bearer wrong' })).status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await send('post', visitor, { Authorization: CREDENTIAL.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it.each(['get', 'post', 'put', 'patch', 'delete'])('checks the credential first for %s', async (method) => {
    expect((await send(method, visitor)).status).toBe(401);
    expect((await send(method, visitor, { Authorization: CREDENTIAL })).status).toBe(200);
  });

  it('accepts an authenticated request with an empty body', async () => {
    const res = await send('get', undefined, { Authorization: CREDENTIAL });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('authenticates regardless of content type', async () => {
    const res = await send('post', JSON.stringify(visitor), { Authorization: CREDENTIAL }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('handles account events', async () => {
    const res = await send('post', account, { Authorization: CREDENTIAL });
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types', async () => {
    const res = await send('post', { ...visitor, eventType: 'something_else' }, { Authorization: CREDENTIAL });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await send('post', 'not json', { Authorization: CREDENTIAL })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await send('post', '[1,2]', { Authorization: CREDENTIAL })).status).toBe(400);
  });

  it('classifies visitor and account data', () => {
    expect(classifyData(visitor.data)).toBe('visitor');
    expect(classifyData(account.data)).toBe('account');
    expect(classifyData({ foo: 1 })).toBeNull();
    expect(classifyData(null)).toBeNull();
  });

  it('never accepts when NAVATTIC_AUTHORIZATION is unset', () => {
    expect(verifyNavatticRequest({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyNavatticRequest({ authorization: '' }, { NAVATTIC_AUTHORIZATION: '' })).toBe(false);
  });
});
