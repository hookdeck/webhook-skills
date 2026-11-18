// Generated with: loops-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST, verifyLoopsWebhook } from '../app/webhooks/loops/route';

// Test-only secret. The HMAC key is the base64-decoded part after whsec_.
const SECRET = `whsec_${Buffer.from('loops-test-signing-key-012345678').toString('base64')}`;

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
  POST(new Request('http://localhost/webhooks/loops', { method: 'POST', headers, body: rawBody }));

const contactIdentity = { id: 'cm4ittmhq0011ow9h6fb460yw', email: 'test@example.com', userId: null };

// Payloads from https://loops.so/docs/webhooks (Event types).
const contactCreated = () =>
  JSON.stringify({
    eventName: 'contact.created',
    eventTime: 1734425918,
    webhookSchemaVersion: '1.0.0',
    contactIdentity: { id: 'cm4itta800003ow9hhekzk94o', email: 'test+5@loops.so', userId: null },
    contact: { id: 'cm4itta800003ow9hhekzk94o', email: 'test+5@loops.so', subscribed: true, favoriteColor: 'blue' },
  });

const testEvent = '{"eventName":"testing.testEvent","eventTime":1734425918,"message":"test","webhookSchemaVersion":"1.0.0"}';

beforeEach(() => {
  process.env.LOOPS_WEBHOOK_SECRET = SECRET;
  delete process.env.LOOPS_WEBHOOK_TOLERANCE_SECONDS;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

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

  it('accepts the vector end to end', async () => {
    process.env.LOOPS_WEBHOOK_SECRET = refSecret;
    const res = await post(refBody, { 'content-type': 'application/json', ...refHeaders });
    expect(res.status).toBe(200);
  });
});

describe('valid signatures', () => {
  it('accepts contact.created', async () => {
    const body = contactCreated();
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('test+5@loops.so'));
  });

  it('accepts email.softBounced', async () => {
    const body = JSON.stringify({
      eventName: 'email.softBounced',
      eventTime: 1734425918,
      webhookSchemaVersion: '1.0.0',
      sourceType: 'transactional',
      transactionalId: 'cm4t1suns001uw6atri87v54s',
      email: { id: 'cm4t1sseg004tje7982991nan', emailMessageId: 'cm4ittv1v001oow9hruou8na8', subject: 'Subject' },
      contactIdentity,
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('email.softBounced (transactional)'));
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
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature }));
    expect(res.status).toBe(200);
  });

  it('returns 200 duplicate for a repeated Webhook-Id', async () => {
    const body = contactCreated();
    const id = newEventId();
    const first = await post(body, signedHeaders(body, { id }));
    const again = await post(body, signedHeaders(body, { id, timestamp: now() + 5 }));
    expect(first.status).toBe(200);
    expect(await again.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const res = await post(contactCreated(), { 'content-type': 'application/json' });
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
