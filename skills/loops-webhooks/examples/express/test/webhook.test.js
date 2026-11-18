// Generated with: loops-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Test-only secret. The HMAC key is the base64-decoded part after whsec_.
const SECRET = `whsec_${Buffer.from('loops-test-signing-key-012345678').toString('base64')}`;

process.env.LOOPS_WEBHOOK_SECRET = SECRET;

const { app, verifyLoopsWebhook } = require('../src/index');

/** Sign exactly like Loops. */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);
let counter = 0;
const newEventId = () => `msg_test${++counter}${Date.now().toString(36)}`;

function signedHeaders(rawBody, { id = newEventId(), timestamp, secret, signature } = {}) {
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': signature ?? sign(rawBody, id, ts, secret),
  };
}

const post = (rawBody, headers) => request(app).post('/webhooks/loops').set(headers).send(rawBody);

const contactIdentity = { id: 'cm4ittmhq0011ow9h6fb460yw', email: 'test@example.com', userId: null };

// Payloads from https://loops.so/docs/webhooks (Event types).
const contactCreated = () =>
  JSON.stringify({
    eventName: 'contact.created',
    eventTime: 1734425918,
    webhookSchemaVersion: '1.0.0',
    contactIdentity: { id: 'cm4itta800003ow9hhekzk94o', email: 'test+5@loops.so', userId: null },
    contact: {
      id: 'cm4itta800003ow9hhekzk94o',
      email: 'test+5@loops.so',
      firstName: null,
      lastName: null,
      source: 'API',
      subscribed: true,
      userGroup: '',
      userId: null,
      mailingLists: { cm4ittp2k000l12j3lgrzvlxt: true },
      optInStatus: 'accepted',
      favoriteColor: 'blue',
    },
  });

const emailEvent = (eventName) =>
  JSON.stringify({
    eventName,
    eventTime: 1734425918,
    webhookSchemaVersion: '1.0.0',
    sourceType: 'campaign',
    campaignId: 'cm4t1suns001uw6atri87v54s',
    email: { id: 'cm4t1sseg004tje7982991nan', emailMessageId: 'cm4ittv1v001oow9hruou8na8', subject: 'Subject of the email' },
    contactIdentity,
  });

const testEvent = '{"eventName":"testing.testEvent","eventTime":1734425918,"message":"test","webhookSchemaVersion":"1.0.0"}';

beforeEach(() => {
  process.env.LOOPS_WEBHOOK_SECRET = SECRET;
  delete process.env.LOOPS_WEBHOOK_TOLERANCE_SECONDS;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('Standard Webhooks reference vector', () => {
  // The published Standard Webhooks example (not a Loops secret). Same algorithm.
  const refSecret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const refBody = '{"test": 2432232314}';
  const refHeaders = {
    'webhook-id': 'msg_p5jXN8AQM9LWM0D4loKWxJek',
    'webhook-timestamp': '1614265330',
    'webhook-signature': 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
  };

  it('verifies with and without the whsec_ prefix', () => {
    expect(verifyLoopsWebhook(refBody, refHeaders, refSecret)).toBe(true);
    expect(verifyLoopsWebhook(Buffer.from(refBody), refHeaders, refSecret.replace('whsec_', ''))).toBe(true);
  });

  it('fails with a 300-second tolerance because the vector is from 2021', () => {
    expect(verifyLoopsWebhook(refBody, refHeaders, refSecret, 300)).toBe(false);
  });
});

describe('valid signatures', () => {
  it('accepts contact.created', async () => {
    const body = contactCreated();
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('test+5@loops.so'));
  });

  it.each(['email.delivered', 'email.hardBounced'])('accepts %s', async (eventName) => {
    const body = emailEvent(eventName);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`${eventName} (campaign)`));
  });

  it('accepts loop.email.sent (workflow emails keep the loop name)', async () => {
    const body = JSON.stringify({
      eventName: 'loop.email.sent',
      eventTime: 1734425918,
      webhookSchemaVersion: '1.0.0',
      contactIdentity,
      loopId: 'cm4t1snfj0052icemfshgqfcw',
      loopName: 'Test Loop',
      email: { id: 'cm4t1socj004mje79e61mgh7d', emailMessageId: 'cm4ittv1v001oow9hruou8na8', subject: 'Subject of the email' },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Subject of the email'));
  });

  it('accepts the testing.testEvent sent from the settings page', async () => {
    const res = await post(testEvent, signedHeaders(testEvent));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Loops test event: test');
  });

  it('accepts a secret without the whsec_ prefix', async () => {
    process.env.LOOPS_WEBHOOK_SECRET = SECRET.replace('whsec_', '');
    const body = contactCreated();
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event names with 200', async () => {
    const body = JSON.stringify({ eventName: 'some.futureEvent', eventTime: 1, webhookSchemaVersion: '1.0.0' });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when either signature matches (24h after rolling the secret)', async () => {
    const oldSecret = `whsec_${Buffer.from('old-loops-signing-key-0123456789').toString('base64')}`;
    const body = contactCreated();
    const id = newEventId();
    const ts = String(now());
    const signature = `${sign(body, id, ts)} ${sign(body, id, ts, oldSecret)}`;
    process.env.LOOPS_WEBHOOK_SECRET = oldSecret;
    expect((await post(body, signedHeaders(body, { id, timestamp: ts, signature }))).status).toBe(200);
  });

  it('returns 200 duplicate for a repeated Webhook-Id', async () => {
    const body = contactCreated();
    const id = newEventId();
    const first = await post(body, signedHeaders(body, { id }));
    const again = await post(body, signedHeaders(body, { id, timestamp: now() + 5 }));
    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ received: true, duplicate: true });
  });

  it('accepts an old timestamp when no tolerance is configured', async () => {
    const body = contactCreated();
    const res = await post(body, signedHeaders(body, { timestamp: now() - 3600 }));
    expect(res.status).toBe(200);
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const res = await post(contactCreated(), { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = contactCreated();
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const other = Buffer.from('some-other-secret-key-0123456789').toString('base64');
    const body = contactCreated();
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature keyed with the secret string instead of its decoded bytes', async () => {
    const body = contactCreated();
    const id = newEventId();
    const ts = String(now());
    const wrong = crypto.createHmac('sha256', SECRET).update(`${id}.${ts}.${body}`).digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });

  it('ignores non-v1 entries', async () => {
    const body = contactCreated();
    const id = newEventId();
    const ts = String(now());
    const v1 = sign(body, id, ts);
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: v1.replace('v1,', 'v2,') }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = contactCreated();
    const headers = signedHeaders(body);
    const res = await post(body.replace('blue', 'red'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a stale timestamp when LOOPS_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
    process.env.LOOPS_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = contactCreated();
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when LOOPS_WEBHOOK_SECRET is not set', async () => {
    delete process.env.LOOPS_WEBHOOK_SECRET;
    const body = contactCreated();
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
