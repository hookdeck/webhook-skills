const request = require('supertest');

const AUTH = 'Bearer 9QQhlsEb8VY';
process.env.EIGHT_X_EIGHT_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verify8x8Request } = require('../src/index');

// Shapes taken from the 8x8 docs' sample payloads (trimmed)
const inbound = {
  namespace: 'SMS',
  eventType: 'inbound_message_received',
  description: 'SMS inbound message',
  payload: { umid: '9e09ac86-bd74-5465-851d-1eb5a5fdbb9a', source: '+6581968289', destination: '+4534735477', body: 'Test MO message' },
};
const receipt = {
  namespace: 'SMS',
  eventType: 'outbound_message_status_changed',
  description: 'SMS outbound message delivery receipt',
  payload: { umid: '9e09ac86-bd74-5465-851d-1eb5a5fdbb9a', status: { state: 'delivered', timestamp: '2016-01-01T00:00:00Z' } },
};
const click = {
  namespace: 'SMS',
  eventType: 'short_url_clicked',
  description: 'Short URL from SMS clicked',
  payload: { eventId: '0f6a0c0f-8b67-4a3a-a6c3-7b0ecf0d2b1a', shortUrl: 'https://2g.to/abc123/abc', targetUrl: 'https://example.com/landing' },
};
const template = {
  eventId: 'e1',
  provider: 'WhatsApp',
  eventType: 'template_status_update',
  eventDetails: { templateName: 'welcome', meta: { status: 'APPROVED' } },
};

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/8x8')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('8x8 webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await post(inbound, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(inbound)).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    expect((await post(inbound, { Authorization: 'Bearer wrong-token' })).status).toBe(401);
  });

  it('rejects the credential without the Bearer prefix', async () => {
    expect((await post(inbound, { Authorization: '9QQhlsEb8VY' })).status).toBe(401);
  });

  it('compares a Basic value as a whole string without decoding it', async () => {
    const basic = 'Basic dXNlcjpwYXNzd29yZA==';
    process.env.EIGHT_X_EIGHT_AUTHORIZATION = basic;
    try {
      expect((await post(inbound, { Authorization: basic })).status).toBe(200);
      expect((await post(inbound, { Authorization: 'Basic dXNlcjpwYXNzd29yZB==' })).status).toBe(401);
      expect((await post(inbound, { Authorization: 'user:password' })).status).toBe(401);
      expect((await post(inbound, { Authorization: 'dXNlcjpwYXNzd29yZA==' })).status).toBe(401);
    } finally {
      process.env.EIGHT_X_EIGHT_AUTHORIZATION = AUTH;
    }
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(receipt), { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: AUTH })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post('[1,2]', { Authorization: AUTH })).status).toBe(400);
  });

  it('accepts every documented event shape', async () => {
    for (const body of [inbound, receipt, click, template]) {
      expect((await post(body, { Authorization: AUTH })).status).toBe(200);
    }
  });

  it('never accepts when EIGHT_X_EIGHT_AUTHORIZATION is unset', () => {
    expect(verify8x8Request({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verify8x8Request({ authorization: '' }, { EIGHT_X_EIGHT_AUTHORIZATION: '' })).toBe(false);
  });
});
