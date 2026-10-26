import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../app/webhooks/baseten/route';
import { verifyBasetenSignature } from '../lib/baseten';

const SECRET = 'baseten_test_secret_0123456789';

// Payloads follow the sample in https://docs.baseten.co/inference/async
const successEvent = {
  request_id: '9876543210abcdef1234567890fedcba',
  model_id: 'abc123',
  deployment_id: 'def456',
  type: 'async_request_completed',
  time: '2024-04-30T01:01:08.883423Z',
  data: { output: 'model response here' },
  errors: [],
};
const failureEvent = {
  ...successEvent,
  data: null,
  errors: [{ code: 'MODEL_PREDICT_ERROR', message: 'Details here' }],
};

const hexSig = (body: string, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('hex');

function send(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-baseten-signature'] = signature;
  return POST(
    new Request('http://localhost/webhooks/baseten', { method: 'POST', headers, body })
  );
}

describe('Baseten webhook route', () => {
  const body = JSON.stringify(successEvent);

  beforeEach(() => {
    process.env.BASETEN_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts a valid v1= signature on a successful request', async () => {
    const res = await send(body, `v1=${hexSig(body)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: 'succeeded' });
  });

  it('accepts the bare digest without the v1= prefix', async () => {
    expect((await send(body, hexSig(body))).status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    expect((await send(body, `v1=${hexSig(body).toUpperCase()}`)).status).toBe(200);
  });

  it('accepts any matching value in a comma-separated header (rotation)', async () => {
    const res = await send(body, `v1=${hexSig(body, 'old_secret')}, v1=${hexSig(body)}`);
    expect(res.status).toBe(200);
  });

  it('reports a failed request when errors are present', async () => {
    const failed = JSON.stringify(failureEvent);
    const res = await send(failed, `v1=${hexSig(failed)}`);
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe('failed');
  });

  it('verifies the exact bytes whatever the content type', async () => {
    expect((await send(body, `v1=${hexSig(body)}`, 'text/plain')).status).toBe(200);
  });

  it('acknowledges unknown event types', async () => {
    const other = JSON.stringify({ ...successEvent, type: 'something_else' });
    const res = await send(other, `v1=${hexSig(other)}`);
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe('ignored');
  });

  it('rejects a missing or empty signature header', async () => {
    expect((await send(body)).status).toBe(401);
    expect((await send(body, '')).status).toBe(401);
  });

  it('rejects a signature from the wrong secret', async () => {
    expect((await send(body, `v1=${hexSig(body, 'wrong')}`)).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const sig = `v1=${hexSig(body)}`;
    expect((await send(body.replace('model response', 'tampered'), sig)).status).toBe(401);
  });

  it('rejects a re-serialized body (whitespace changes the bytes)', async () => {
    const sig = `v1=${hexSig(body)}`;
    expect((await send(JSON.stringify(successEvent, null, 2), sig)).status).toBe(401);
  });

  it('rejects wrong-length and non-hex signatures', async () => {
    expect((await send(body, 'v1=abc123')).status).toBe(401);
    expect((await send(body, `v1=${'z'.repeat(64)}`)).status).toBe(401);
    expect((await send(body, `v1=${hexSig(body)}00`)).status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const bad = 'not json';
    expect((await send(bad, `v1=${hexSig(bad)}`)).status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.BASETEN_WEBHOOK_SECRET;
    expect((await send(body, `v1=${hexSig(body)}`)).status).toBe(500);
  });

  it('verifyBasetenSignature handles an empty body', () => {
    const empty = Buffer.alloc(0);
    expect(verifyBasetenSignature(empty, `v1=${hexSig('')}`, SECRET)).toBe(true);
  });
});
