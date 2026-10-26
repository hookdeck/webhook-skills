const request = require('supertest');

const USERNAME = 'hostaway-hook';
const PASSWORD = 'p@ss:word/with+colon';

process.env.HOSTAWAY_WEBHOOK_USERNAME = USERNAME;
process.env.HOSTAWAY_WEBHOOK_PASSWORD = PASSWORD;

const app = require('../src/index');
const { verifyHostawayRequest, parseBasicAuth, getEventName } = app;

const basic = (user, pass) => 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
const GOOD = basic(USERNAME, PASSWORD);

// Illustrative payload: Hostaway doesn't document the unified webhook body field by field.
const payload = (event = 'reservation.created') => ({
  event,
  data: { id: 1001, listingMapId: 2002, guestName: 'Jane Doe', status: 'new' },
});

const EVENTS = [
  'reservation.created',
  'reservation.updated',
  'message.received',
  'task.created',
  'task.updated',
];

const send = (method, headers = {}, body) => {
  const req = request(app)[method.toLowerCase()]('/webhooks/hostaway').set(headers);
  return body === undefined ? req : req.set('Content-Type', 'application/json').send(body);
};

describe('Hostaway Basic auth', () => {
  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])('accepts valid credentials on %s', async (method) => {
    const res = await send(method, { Authorization: GOOD }, method === 'GET' ? undefined : JSON.stringify(payload()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])('checks the credential first on %s', async (method) => {
    const res = await send(method, {}, method === 'GET' ? undefined : JSON.stringify(payload()));
    expect(res.status).toBe(401);
  });

  it('accepts a lowercase scheme', async () => {
    const res = await send('POST', { Authorization: GOOD.replace('Basic', 'basic') }, '{}');
    expect(res.status).toBe(200);
  });

  it('accepts a non-ASCII password', () => {
    expect(verifyHostawayRequest({ authorization: basic('üser', 'pässwörd:ü') }, 'üser', 'pässwörd:ü')).toBe(true);
  });

  it('rejects a wrong username', async () => {
    expect((await send('POST', { Authorization: basic('nope', PASSWORD) }, '{}')).status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    expect((await send('POST', { Authorization: basic(USERNAME, 'nope') }, '{}')).status).toBe(401);
  });

  it('rejects a password that is only a prefix of the real one', async () => {
    expect((await send('POST', { Authorization: basic(USERNAME, PASSWORD.slice(0, -1)) }, '{}')).status).toBe(401);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await send('POST', {}, '{}')).status).toBe(401);
  });

  it('rejects a non-Basic scheme', async () => {
    expect((await send('POST', { Authorization: 'Bearer ' + GOOD.slice(6) }, '{}')).status).toBe(401);
  });

  it('rejects credentials without a colon', async () => {
    const header = 'Basic ' + Buffer.from('no-colon-here').toString('base64');
    expect((await send('POST', { Authorization: header }, '{}')).status).toBe(401);
  });

  it('rejects invalid base64', async () => {
    expect((await send('POST', { Authorization: 'Basic !!!not-base64!!!' }, '{}')).status).toBe(401);
  });

  it('rejects valid credentials followed by junk', async () => {
    expect((await send('POST', { Authorization: GOOD + '@@@' }, '{}')).status).toBe(401);
    expect((await send('POST', { Authorization: GOOD + ' extra' }, '{}')).status).toBe(401);
  });

  it('rejects everything when credentials are not configured', () => {
    expect(verifyHostawayRequest({ authorization: basic('', '') }, '', '')).toBe(false);
    delete process.env.HOSTAWAY_WEBHOOK_USERNAME;
    delete process.env.HOSTAWAY_WEBHOOK_PASSWORD;
    try {
      expect(verifyHostawayRequest({ authorization: GOOD })).toBe(false);
    } finally {
      process.env.HOSTAWAY_WEBHOOK_USERNAME = USERNAME;
      process.env.HOSTAWAY_WEBHOOK_PASSWORD = PASSWORD;
    }
  });

  it('parses the first colon only', () => {
    expect(parseBasicAuth(GOOD)).toEqual({ username: USERNAME, password: PASSWORD });
  });
});

describe('Hostaway events and bodies', () => {
  it.each(EVENTS)('handles %s', async (event) => {
    const res = await send('POST', { Authorization: GOOD }, JSON.stringify(payload(event)));
    expect(res.status).toBe(200);
  });

  it('reads eventType and object/action event names', () => {
    expect(getEventName({ eventType: 'task.updated' })).toBe('task.updated');
    expect(getEventName({ object: 'message', action: 'received' })).toBe('message.received');
    expect(getEventName({ foo: 'bar' })).toBeNull();
    expect(getEventName(null)).toBeNull();
  });

  it('accepts an empty body', async () => {
    const res = await request(app).post('/webhooks/hostaway').set('Authorization', GOOD);
    expect(res.status).toBe(200);
  });

  it('accepts and logs unknown shapes', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const res = await send('POST', { Authorization: GOOD }, JSON.stringify({ something: 'else' }));
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('Unhandled event: null', ['something']);
    spy.mockRestore();
  });

  it('accepts a non-JSON body of any content type', async () => {
    const res = await request(app)
      .post('/webhooks/hostaway')
      .set('Authorization', GOOD)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('event=reservation.created');
    expect(res.status).toBe(200);
  });

  it('answers other methods with 405 after authenticating', async () => {
    const res = await request(app).options('/webhooks/hostaway').set('Authorization', GOOD);
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, POST, PUT, PATCH, DELETE');
  });
});
