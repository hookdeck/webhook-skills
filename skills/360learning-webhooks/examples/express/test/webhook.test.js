// Generated with: 360learning-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Test-only secret. The HMAC key is the base64-decoded secret.
const SECRET = `whsec_${Buffer.from('360learning-test-signing-key-012').toString('base64')}`;

process.env.THREE_SIXTY_LEARNING_WEBHOOK_SECRET = SECRET;

const { app, verify360LearningWebhook, parseSecrets } = require('../src/index');

/** Sign exactly like 360Learning (Standard Webhooks via Svix). */
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

const post = (rawBody, headers) => request(app).post('/webhooks/360learning').set(headers).send(rawBody);

// Shape from 360Learning's "Event payload and headers" page (timestamp in ms).
const userCreated = () =>
  JSON.stringify({
    type: 'user.created',
    timestamp: 1749816650724,
    data: {
      userId: '684c154ab06eb32565e5cbc0',
      createdAt: '2025-06-13T12:10:50.568Z',
      firstName: 'Ada',
      lastName: 'Lovelace',
      mail: 'Ada.Lovelace@domain.com',
    },
  });

beforeEach(() => {
  process.env.THREE_SIXTY_LEARNING_WEBHOOK_SECRET = SECRET;
  delete process.env.THREE_SIXTY_LEARNING_WEBHOOK_TOLERANCE_SECONDS;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('Standard Webhooks reference vector', () => {
  // The published Standard Webhooks / Svix example (not a 360Learning secret).
  const refSecret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const refBody = '{"test": 2432232314}';
  const refHeaders = {
    'webhook-id': 'msg_p5jXN8AQM9LWM0D4loKWxJek',
    'webhook-timestamp': '1614265330',
    'webhook-signature': 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
  };

  it('verifies with and without the whsec_ prefix', () => {
    expect(verify360LearningWebhook(refBody, refHeaders, refSecret)).toBe(true);
    expect(verify360LearningWebhook(Buffer.from(refBody), refHeaders, refSecret.replace('whsec_', ''))).toBe(true);
  });

  it('fails with a 5-minute tolerance because the vector is from 2021', () => {
    expect(verify360LearningWebhook(refBody, refHeaders, refSecret, 300)).toBe(false);
  });
});

describe('raw body, not JSON.stringify(req.body)', () => {
  it('verifies a body that re-serialisation would change', async () => {
    // Pretty-printed with an escaped character: JSON.stringify(JSON.parse(body)) differs.
    const body = '{\n  "type": "user.updated",\n  "timestamp": 1749816650724,\n  "data": { "userId": "684c154ab06eb32565e5cbc0", "lastName": "Lov\\u00e9lace" }\n}';
    expect(JSON.stringify(JSON.parse(body))).not.toBe(body);
    const headers = signedHeaders(body);
    const res = await post(body, headers);
    expect(res.status).toBe(200);
    // The approach in 360Learning's sample would have rejected it.
    expect(verify360LearningWebhook(JSON.stringify(JSON.parse(body)), headers, SECRET)).toBe(false);
  });
});

describe('valid signatures', () => {
  it('accepts user.created', async () => {
    const body = userCreated();
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('684c154ab06eb32565e5cbc0'));
  });

  it('accepts course.attempt.closed', async () => {
    const body = JSON.stringify({
      type: 'course.attempt.closed',
      timestamp: 1748346292000,
      data: {
        attemptId: '507f1f77bcf86cd799439011',
        closedAt: '2025-06-13T12:10:50.568Z',
        userId: '507f1f77bcf86cd799439012',
        courseId: '507f1f77bcf86cd799439013',
        reason: 'learnerFinished',
        context: {},
      },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('learnerFinished'));
  });

  it('accepts path.session.user.status.updated', async () => {
    const body = JSON.stringify({
      type: 'path.session.user.status.updated',
      timestamp: 1748346292000,
      data: { userId: 'u1', pathId: 'p1', sessionId: 's1', enrollmentId: 'e1', status: 'successful', updatedAt: '2025-06-13T12:10:50.568Z' },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('successful'));
  });

  it('accepts an xapi.started statement (no type field)', async () => {
    const body = JSON.stringify({
      id: '6b951307-9deb-47f5-b8f9-65e505bac3e4',
      actor: { objectType: 'Agent', mbox: 'mailto:john.smith@yopmail.com' },
      verb: { id: 'http://adlnet.gov/expapi/verbs/initialized', display: { 'en-US': 'initialized' } },
      object: { objectType: 'Activity', id: 'urn:360learning:course:507f1f77bcf86cd799439011' },
      context: {},
      timestamp: '2025-06-13T12:10:50.568Z',
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('verbs/initialized'));
  });

  it('accepts a secret without the whsec_ prefix', async () => {
    process.env.THREE_SIXTY_LEARNING_WEBHOOK_SECRET = SECRET.replace('whsec_', '');
    const body = userCreated();
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts any of several subscription secrets (comma-separated)', async () => {
    const other = Buffer.from('second-subscription-secret-01234').toString('base64');
    process.env.THREE_SIXTY_LEARNING_WEBHOOK_SECRET = `${SECRET}, ${other}`;
    expect(parseSecrets(process.env.THREE_SIXTY_LEARNING_WEBHOOK_SECRET)).toHaveLength(2);
    const body = userCreated();
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify({ type: 'some.future.event', timestamp: 1, data: {} });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when either signature matches (24h rotation grace period)', async () => {
    const legacy = `whsec_${Buffer.from('legacy-360learning-signing-key-0').toString('base64')}`;
    const fresh = `whsec_${Buffer.from('rotated-360learning-signing-key0').toString('base64')}`;
    const body = userCreated();
    const id = newEventId();
    const ts = String(now());
    // Header order from the docs: "v1,<new_signature> v1,<legacy_signature>"
    const signature = `${sign(body, id, ts, fresh)} ${sign(body, id, ts, legacy)}`;
    process.env.THREE_SIXTY_LEARNING_WEBHOOK_SECRET = legacy;
    expect((await post(body, signedHeaders(body, { id, timestamp: ts, signature }))).status).toBe(200);
    process.env.THREE_SIXTY_LEARNING_WEBHOOK_SECRET = fresh;
    const id2 = newEventId();
    const signature2 = `${sign(body, id2, ts, fresh)} ${sign(body, id2, ts, legacy)}`;
    expect((await post(body, signedHeaders(body, { id: id2, timestamp: ts, signature: signature2 }))).status).toBe(200);
  });

  it('returns 200 duplicate for a retry (same webhook-id, new timestamp)', async () => {
    const body = userCreated();
    const id = newEventId();
    const first = await post(body, signedHeaders(body, { id }));
    const retry = await post(body, signedHeaders(body, { id, timestamp: now() + 5 }));
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({ received: true, duplicate: true });
  });

  it('accepts an old timestamp when no tolerance is configured', async () => {
    const body = userCreated();
    const res = await post(body, signedHeaders(body, { timestamp: now() - 3600 }));
    expect(res.status).toBe(200);
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const res = await post(userCreated(), { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = userCreated();
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const other = Buffer.from('some-other-secret-key-0123456789').toString('base64');
    const body = userCreated();
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature keyed with the secret string instead of its decoded bytes', async () => {
    const body = userCreated();
    const id = newEventId();
    const ts = String(now());
    const wrong = crypto.createHmac('sha256', SECRET).update(`${id}.${ts}.${body}`).digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });

  it('ignores non-v1 entries', async () => {
    const body = userCreated();
    const id = newEventId();
    const ts = String(now());
    const v1 = sign(body, id, ts);
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: v1.replace('v1,', 'v2,') }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = userCreated();
    const headers = signedHeaders(body);
    const res = await post(body.replace('Ada', 'Eve'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a stale timestamp when THREE_SIXTY_LEARNING_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
    process.env.THREE_SIXTY_LEARNING_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = userCreated();
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when THREE_SIXTY_LEARNING_WEBHOOK_SECRET is not set', async () => {
    delete process.env.THREE_SIXTY_LEARNING_WEBHOOK_SECRET;
    const body = userCreated();
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
