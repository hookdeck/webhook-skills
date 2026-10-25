const request = require('supertest');

const SECRET = 'Bearer secret-token-12345';
process.env.EGNYTE_AUTHORIZATION = SECRET;

const app = require('../src/index');
const { verifyEgnyteRequest } = require('../src/index');

// Shape taken from Egnyte's documented webhook payload (trimmed)
const batch = {
  data: [
    {
      eventId: 'evt-1',
      domain: 'apidemo',
      timestamp: 1710000000000,
      user: { id: 1, displayName: 'John Doe', username: 'johndoe', email: 'john@example.com' },
      actionSource: 'WebUI',
      eventType: 'fs:add_file',
      webhookId: 'c9ac0519-284a-4bee-9574-30ae7891e5dc',
      data: { targetPath: '/Shared/Documents/a.txt', itemType: 'file' },
    },
    {
      eventId: 'evt-2',
      domain: 'apidemo',
      timestamp: 1710000001000,
      user: { id: 1, username: 'johndoe' },
      actionSource: 'API',
      eventType: 'link:create',
      webhookId: 'c9ac0519-284a-4bee-9574-30ae7891e5dc',
      data: {},
    },
  ],
};

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/egnyte')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Egnyte webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value with exactly 200', async () => {
    const res = await post(batch, { Authorization: SECRET });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(batch)).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    const res = await post(batch, { Authorization: 'Bearer wrong-token-00000' });
    expect(res.status).toBe(401);
  });

  it('rejects the credential without the "Bearer " prefix', async () => {
    const res = await post(batch, { Authorization: SECRET.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('rejects a non-ASCII credential without throwing', async () => {
    const res = await post(batch, { Authorization: Buffer.from('Bearer sécret', 'utf8').toString('latin1') });
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(batch), { Authorization: SECRET }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('dispatches every event in data[]', async () => {
    await post(batch, { Authorization: SECRET });
    expect(console.log).toHaveBeenCalledWith('File added: /Shared/Documents/a.txt');
    expect(console.log).toHaveBeenCalledWith('Link created by johndoe');
  });

  it('acknowledges unknown event types with 200', async () => {
    const res = await post({ data: [{ eventId: 'e', eventType: 'user:create' }] }, { Authorization: SECRET });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: SECRET })).status).toBe(400);
  });

  it('returns 400 when data is not an array', async () => {
    expect((await post({ data: {} }, { Authorization: SECRET })).status).toBe(400);
    expect((await post('[1,2]', { Authorization: SECRET })).status).toBe(400);
  });

  it('never accepts when EGNYTE_AUTHORIZATION is unset', () => {
    expect(verifyEgnyteRequest({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyEgnyteRequest({ authorization: '' }, { EGNYTE_AUTHORIZATION: '' })).toBe(false);
  });
});
