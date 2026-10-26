const request = require('supertest');

const USERNAME = 'rudder-user';
const PASSWORD = 'p@ss:word/with:colons';
process.env.RUDDERSTACK_WEBHOOK_USERNAME = USERNAME;
process.env.RUDDERSTACK_WEBHOOK_PASSWORD = PASSWORD;

const app = require('../src/index');
const { verifyRudderstackRequest, parseBasicAuth } = app;

const basic = (user, pass, scheme = 'Basic') =>
  `${scheme} ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
const good = basic(USERNAME, PASSWORD);

const track = { type: 'track', event: 'Order Completed', userId: 'u1', properties: { total: 10 } };
const identify = { type: 'identify', userId: 'u1', traits: { email: 'a@example.com' } };

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('RudderStack webhook (Basic auth)', () => {
  it('accepts a track event with correct credentials', async () => {
    const res = await request(app)
      .post('/webhooks/rudderstack')
      .set('Authorization', good)
      .send(track);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, events: 1 });
  });

  it('accepts an identify event', async () => {
    const res = await request(app)
      .post('/webhooks/rudderstack')
      .set('Authorization', good)
      .send(identify);
    expect(res.status).toBe(200);
  });

  it('accepts a lowercase scheme and a non-JSON content type', async () => {
    const res = await request(app)
      .post('/webhooks/rudderstack')
      .set('Authorization', basic(USERNAME, PASSWORD, 'basic'))
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(track));
    expect(res.status).toBe(200);
  });

  it('accepts a batched array of events', async () => {
    const res = await request(app)
      .post('/webhooks/rudderstack')
      .set('Authorization', good)
      .send([track, identify]);
    expect(res.status).toBe(200);
    expect(res.body.events).toBe(2);
  });

  it.each(['put', 'patch', 'delete'])('accepts %s', async (method) => {
    const res = await request(app)[method]('/webhooks/rudderstack')
      .set('Authorization', good)
      .send(track);
    expect(res.status).toBe(200);
  });

  it('accepts GET with an empty body', async () => {
    const res = await request(app).get('/webhooks/rudderstack').set('Authorization', good);
    expect(res.status).toBe(200);
    expect(res.body.events).toBe(0);
  });

  it('rejects a missing Authorization header', async () => {
    const res = await request(app).post('/webhooks/rudderstack').send(track);
    expect(res.status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    const res = await request(app)
      .post('/webhooks/rudderstack')
      .set('Authorization', basic(USERNAME, 'nope'))
      .send(track);
    expect(res.status).toBe(401);
  });

  it('rejects a wrong username', async () => {
    const res = await request(app)
      .post('/webhooks/rudderstack')
      .set('Authorization', basic('other', PASSWORD))
      .send(track);
    expect(res.status).toBe(401);
  });

  it('rejects the password in the username slot', async () => {
    const res = await request(app)
      .post('/webhooks/rudderstack')
      .set('Authorization', basic(PASSWORD, USERNAME))
      .send(track);
    expect(res.status).toBe(401);
  });

  it('rejects a Bearer scheme and malformed values', async () => {
    for (const value of [
      `Bearer ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}`,
      'Basic',
      'Basic !!!not-base64!!!',
      `Basic ${Buffer.from('no-colon-here').toString('base64')}`,
    ]) {
      const res = await request(app)
        .post('/webhooks/rudderstack')
        .set('Authorization', value)
        .send(track);
      expect(res.status).toBe(401);
    }
  });

  it('rejects bad credentials on GET too', async () => {
    const res = await request(app).get('/webhooks/rudderstack');
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON after authenticating', async () => {
    const res = await request(app)
      .post('/webhooks/rudderstack')
      .set('Authorization', good)
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON scalar', async () => {
    const res = await request(app)
      .post('/webhooks/rudderstack')
      .set('Authorization', good)
      .set('Content-Type', 'application/json')
      .send('42');
    expect(res.status).toBe(400);
  });

  it('returns 405 for unsupported methods', async () => {
    const res = await request(app).options('/webhooks/rudderstack').set('Authorization', good);
    expect(res.status).toBe(405);
  });
});

describe('verifyRudderstackRequest', () => {
  it('fails closed when unconfigured', () => {
    expect(verifyRudderstackRequest({ authorization: good }, {})).toBe(false);
    expect(
      verifyRudderstackRequest({ authorization: good }, { RUDDERSTACK_WEBHOOK_USERNAME: USERNAME })
    ).toBe(false);
  });

  it('handles non-ASCII credentials', () => {
    const config = { RUDDERSTACK_WEBHOOK_USERNAME: 'üser', RUDDERSTACK_WEBHOOK_PASSWORD: 'pässwörd' };
    expect(verifyRudderstackRequest({ authorization: basic('üser', 'pässwörd') }, config)).toBe(true);
    expect(verifyRudderstackRequest({ authorization: basic('user', 'pässwörd') }, config)).toBe(false);
  });

  it('splits on the first colon', () => {
    expect(parseBasicAuth(basic('a', 'b:c:d'))).toEqual({ username: 'a', password: 'b:c:d' });
  });
});
