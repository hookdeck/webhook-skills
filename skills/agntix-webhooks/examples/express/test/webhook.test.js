// Generated with: agntix-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import request from 'supertest';

// Svix secrets are "whsec_" + base64(key bytes). The HMAC key is the
// base64-DECODED part after "whsec_".
const SECRET = 'whsec_' + Buffer.from('agntix-test-signing-key-012345678').toString('base64');
const OTHER_SECRET = 'whsec_' + Buffer.from('some-other-endpoint-signing-key01').toString('base64');

process.env.AGNTIX_WEBHOOK_SECRET = SECRET;

// Import after setting the env var
const { app } = await import('../src/index.js');

/** Sign exactly like Agntix (Svix). */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, opts = {}) {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'Content-Type': opts.contentType ?? 'application/json',
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/agntix').set(headers).send(rawBody);
}

function sessionCreated(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    eventType: 'session.created',
    type: 'VOICE',
    platform: 'PHONE',
    direction: 'OUTBOUND',
    state: 'OPEN',
    agentId: '40235145-aa3d-443e-9d0c-841dd0716a2f',
    createdAt: '2026-04-08T05:00:01.130Z',
    metadata: {
      customerPhoneNumber: '+971501234567',
      sessionVariables: { crmContactId: 'CRM-7728' },
    },
    ...overrides,
  };
}

function sessionEnded(overrides = {}) {
  return {
    ...sessionCreated(),
    eventType: 'session.ended',
    state: 'CLOSED',
    lastActivityAt: '2026-04-08T05:00:01.130Z',
    endedAt: '2026-04-08T05:00:10.546Z',
    analysis: { summary: 'Customer confirmed delivery slot for Wednesday afternoon.' },
    recordingUrl: 'https://app.agntix.ai/en/logs-history?opened=4981804c',
    ...overrides,
  };
}

beforeEach(() => {
  process.env.AGNTIX_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts session.created', async () => {
    const body = JSON.stringify(sessionCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Session created'));
  });

  it('accepts session.ended', async () => {
    const body = JSON.stringify(sessionEnded());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Customer confirmed delivery slot'));
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(sessionCreated({ eventType: 'session.updated' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unhandled Agntix event type'));
  });

  it('verifies any content type (raw body, not JSON-parsed)', async () => {
    const body = JSON.stringify(sessionCreated());
    const res = await post(body, signedHeaders(body, { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-delimited signatures matches', async () => {
    const body = JSON.stringify(sessionCreated());
    const headers = signedHeaders(body);
    headers['svix-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWduYXR1cmU= ${headers['svix-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });
});

describe('deduplication', () => {
  it('acknowledges a retried event without reprocessing it', async () => {
    const body = JSON.stringify(sessionEnded());
    const first = await post(body, signedHeaders(body));
    const retry = await post(body, signedHeaders(body));
    expect(first.body).toEqual({ received: true });
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({ received: true, duplicate: true });
  });

  it('does not treat session.ended as a duplicate of session.created for the same session', async () => {
    const created = sessionCreated();
    const createdBody = JSON.stringify(created);
    const endedBody = JSON.stringify(sessionEnded({ id: created.id }));
    await post(createdBody, signedHeaders(createdBody));
    const res = await post(endedBody, signedHeaders(endedBody));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});

describe('invalid requests', () => {
  it('rejects a tampered body', async () => {
    const body = JSON.stringify(sessionCreated());
    const headers = signedHeaders(body);
    const res = await post(body.replace('VOICE', 'CHAT'), headers);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid signature' });
  });

  it('rejects a signature made with another endpoint secret', async () => {
    const body = JSON.stringify(sessionCreated());
    const res = await post(body, signedHeaders(body, { secret: OTHER_SECRET }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than 5 minutes', async () => {
    const body = JSON.stringify(sessionCreated());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp in the future', async () => {
    const body = JSON.stringify(sessionCreated());
    const res = await post(body, signedHeaders(body, { timestamp: now() + 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed signature header', async () => {
    const body = JSON.stringify(sessionCreated());
    const res = await post(body, signedHeaders(body, { signature: 'garbage' }));
    expect(res.status).toBe(400);
  });

  it.each(['svix-id', 'svix-timestamp', 'svix-signature'])('rejects a missing %s header', async (name) => {
    const body = JSON.stringify(sessionCreated());
    const headers = signedHeaders(body);
    delete headers[name];
    const res = await post(body, headers);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing Svix signature headers' });
  });

  it('fails closed with 500 when the secret is not configured', async () => {
    delete process.env.AGNTIX_WEBHOOK_SECRET;
    const body = JSON.stringify(sessionCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});

describe('health', () => {
  it('responds on /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
