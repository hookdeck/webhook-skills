// Generated with: 360learning-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST, verify360LearningWebhook } from '../app/webhooks/360learning/route';

// Test-only secret. The HMAC key is the base64-decoded secret.
const SECRET = `whsec_${Buffer.from('360learning-test-signing-key-012').toString('base64')}`;

function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);
let counter = 0;
const newEventId = () => `msg_test${++counter}${Date.now().toString(36)}`;

interface SignOptions {
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id ?? newEventId();
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

const post = (rawBody: string, headers: Record<string, string>) =>
  POST(new Request('http://localhost/webhooks/360learning', { method: 'POST', headers, body: rawBody }));

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
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

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

  it('accepts the vector end to end', async () => {
    process.env.THREE_SIXTY_LEARNING_WEBHOOK_SECRET = refSecret;
    const res = await post(refBody, { 'content-type': 'application/json', ...refHeaders });
    expect(res.status).toBe(200);
  });
});

describe('raw body, not JSON.stringify(req.body)', () => {
  it('verifies a body that re-serialisation would change', async () => {
    const body = '{\n  "type": "user.updated",\n  "timestamp": 1749816650724,\n  "data": { "userId": "684c154ab06eb32565e5cbc0", "lastName": "Lov\\u00e9lace" }\n}';
    expect(JSON.stringify(JSON.parse(body))).not.toBe(body);
    const headers = signedHeaders(body);
    const res = await post(body, headers);
    expect(res.status).toBe(200);
    const signatureHeaders = {
      'webhook-id': headers['webhook-id'],
      'webhook-timestamp': headers['webhook-timestamp'],
      'webhook-signature': headers['webhook-signature'],
    };
    expect(verify360LearningWebhook(JSON.stringify(JSON.parse(body)), signatureHeaders, SECRET)).toBe(false);
  });
});

describe('valid signatures', () => {
  it('accepts user.created', async () => {
    const body = userCreated();
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('684c154ab06eb32565e5cbc0'));
  });

  it('accepts path.session.user.status.updated', async () => {
    const body = JSON.stringify({
      type: 'path.session.user.status.updated',
      timestamp: 1748346292000,
      data: { userId: 'u1', pathId: 'p1', sessionId: 's1', enrollmentId: 'e1', status: 'late', updatedAt: '2025-06-13T12:10:50.568Z' },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('is late'));
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
    process.env.THREE_SIXTY_LEARNING_WEBHOOK_SECRET = `${SECRET},${other}`;
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
    process.env.THREE_SIXTY_LEARNING_WEBHOOK_SECRET = legacy;
    const body = userCreated();
    const id = newEventId();
    const ts = String(now());
    const signature = `${sign(body, id, ts, fresh)} ${sign(body, id, ts, legacy)}`;
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature }));
    expect(res.status).toBe(200);
  });

  it('returns 200 duplicate for a retry (same webhook-id)', async () => {
    const body = userCreated();
    const id = newEventId();
    const first = await post(body, signedHeaders(body, { id }));
    const retry = await post(body, signedHeaders(body, { id, timestamp: now() + 5 }));
    expect(first.status).toBe(200);
    expect(await retry.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const res = await post(userCreated(), { 'content-type': 'application/json' });
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
