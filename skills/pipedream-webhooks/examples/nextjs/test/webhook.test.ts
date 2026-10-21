import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { verifyPipedreamSignature, parseSignatureHeader } from '../lib/pipedream-signature';

// Pipedream signing keys are opaque strings used verbatim (UTF-8) as the HMAC key.
const SIGNING_KEY = 'pd_test_signing_key_4f3c2b1a0e9d8c7b6a5f4e3d2c1b0a99';
const CONNECT_TOKEN = 'connect-url-token-123';

let triggerPOST: (req: NextRequest) => Promise<Response>;
let connectPOST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.PIPEDREAM_WEBHOOK_SIGNING_KEY = SIGNING_KEY;
  process.env.PIPEDREAM_CONNECT_WEBHOOK_TOKEN = CONNECT_TOKEN;
  triggerPOST = (await import('../app/webhooks/pipedream/route')).POST;
  connectPOST = (await import('../app/webhooks/pipedream/connect/route')).POST;
});

/** Build x-pd-signature exactly as Pipedream does: t=<seconds>,v1=<hex HMAC of "t.body"> */
function signatureHeader(payload: string, { key = SIGNING_KEY, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const sig = crypto.createHmac('sha256', key).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

function post(path: string, body: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

// A trigger delivery body is whatever the deployed trigger emitted (here, gitlab-new-issue).
const triggerEvent = {
  object_kind: 'issue',
  project: { id: 45672541, name: 'demo' },
  object_attributes: { id: 1, iid: 7, title: 'Bug report', action: 'open' },
};

const connectionSuccess = {
  event: 'CONNECTION_SUCCESS',
  connect_token: 'ctok_xxxxxxx',
  environment: 'production',
  connect_session_id: 1.4058728083872854e38,
  account: {
    id: 'apn_xxxxxxx',
    name: 'jane@example.com',
    external_id: 'user-abc-123',
    healthy: true,
    dead: null,
    app: { id: 'oa_xxxxxxx', name_slug: 'google_sheets', name: 'Google Sheets', auth_type: 'oauth' },
    created_at: '2026-03-25T17:49:15.000Z',
    updated_at: '2026-03-25T17:49:15.000Z',
  },
};

const connectionError = {
  event: 'CONNECTION_ERROR',
  connect_token: 'ctok_xxxxxxx',
  environment: 'production',
  connect_session_id: 1.4058727315359677e38,
  error: 'Test request failed. Please verify your credentials and try again.',
};

describe('verifyPipedreamSignature', () => {
  const body = JSON.stringify(triggerEvent);

  it('accepts a valid signature', () => {
    expect(verifyPipedreamSignature(body, signatureHeader(body), SIGNING_KEY)).toEqual({ valid: true });
  });

  it('matches the example header format from the Pipedream docs', () => {
    const t = 1616000000;
    const header = signatureHeader(body, { timestamp: t });
    expect(header).toMatch(/^t=1616000000,v1=[0-9a-f]{64}$/);
    expect(verifyPipedreamSignature(body, header, SIGNING_KEY, 300, t).valid).toBe(true);
  });

  it('rejects a missing header', () => {
    expect(verifyPipedreamSignature(body, null, SIGNING_KEY)).toEqual({ valid: false, error: 'Missing x-pd-signature header' });
  });

  it.each(['v1=abc', 't=123', 't=abc,v1=deadbeef', 'garbage'])('rejects malformed header %s', (header) => {
    expect(verifyPipedreamSignature(body, header, SIGNING_KEY)).toEqual({ valid: false, error: 'Malformed x-pd-signature header' });
  });

  it('rejects a stale timestamp', () => {
    const old = Math.floor(Date.now() / 1000) - 301;
    expect(verifyPipedreamSignature(body, signatureHeader(body, { timestamp: old }), SIGNING_KEY)).toEqual({
      valid: false,
      error: 'Timestamp outside tolerance',
    });
  });

  it('rejects a signature made with a different key', () => {
    expect(verifyPipedreamSignature(body, signatureHeader(body, { key: 'other' }), SIGNING_KEY)).toEqual({
      valid: false,
      error: 'Invalid signature',
    });
  });

  it('rejects a re-serialised body', () => {
    const pretty = JSON.stringify(triggerEvent, null, 2);
    expect(verifyPipedreamSignature(pretty, signatureHeader(body), SIGNING_KEY).valid).toBe(false);
  });

  it('parses the header into timestamp and v1 signatures', () => {
    expect(parseSignatureHeader('t=1616000000,v1=ABCDEF')).toEqual({ timestamp: '1616000000', signatures: ['abcdef'] });
  });
});

describe('POST /webhooks/pipedream (trigger webhooks)', () => {
  const body = JSON.stringify(triggerEvent);

  it('returns 200 for a valid signed trigger event', async () => {
    const res = await triggerPOST(post('/webhooks/pipedream', body, { 'x-pd-signature': signatureHeader(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 400 without x-pd-signature', async () => {
    const res = await triggerPOST(post('/webhooks/pipedream', body));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered body', async () => {
    const res = await triggerPOST(
      post('/webhooks/pipedream', body.replace('Bug report', 'Tampered'), { 'x-pd-signature': signatureHeader(body) })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a stale timestamp', async () => {
    const header = signatureHeader(body, { timestamp: Math.floor(Date.now() / 1000) - 600 });
    const res = await triggerPOST(post('/webhooks/pipedream', body, { 'x-pd-signature': header }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const res = await triggerPOST(post('/webhooks/pipedream', 'not json', { 'x-pd-signature': signatureHeader('not json') }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON payload' });
  });
});

describe('POST /webhooks/pipedream/connect (connection webhooks)', () => {
  it.each([
    ['CONNECTION_SUCCESS', connectionSuccess],
    ['CONNECTION_ERROR', connectionError],
  ])('returns 200 for %s with the URL token', async (_name, payload) => {
    const res = await connectPOST(post(`/webhooks/pipedream/connect?token=${CONNECT_TOKEN}`, JSON.stringify(payload)));
    expect(res.status).toBe(200);
  });

  it('returns 400 when the URL token is missing or wrong', async () => {
    const missing = await connectPOST(post('/webhooks/pipedream/connect', JSON.stringify(connectionSuccess)));
    const wrong = await connectPOST(post('/webhooks/pipedream/connect?token=nope', JSON.stringify(connectionSuccess)));
    expect(missing.status).toBe(400);
    expect(wrong.status).toBe(400);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await connectPOST(post(`/webhooks/pipedream/connect?token=${CONNECT_TOKEN}`, '{bad'));
    expect(res.status).toBe(400);
  });
});
