import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/payroc/route';
import { verifyPayrocRequest } from '../lib/verify-payroc';

const SECRET = 'test_payroc_secret_0123456789';

beforeAll(() => {
  process.env.PAYROC_WEBHOOK_SECRET = SECRET;
});

// Payloads follow the samples in Payroc's event documentation.
const SAMPLES: Record<string, object> = {
  'processingAccount.status.changed': {
    specversion: '1.0',
    type: 'processingAccount.status.changed',
    version: '1.0.0',
    source: 'payroc',
    id: '123e4567-e89b-12d3-a456-426614174000',
    time: '2024-07-02T15:30:00.000Z',
    datacontenttype: 'application/json',
    data: { processingAccountId: '38765', status: 'entered' },
  },
  'processingAccount.riskStatus.changed': {
    specversion: '1.0',
    type: 'processingAccount.riskStatus.changed',
    version: '1.0.0',
    source: 'payroc',
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    time: '2024-09-15T10:45:00.000Z',
    datacontenttype: 'application/json',
    data: { processingAccountId: '38765', riskStatus: 'fullSuspense' },
  },
  'processingAccount.signature.signed': {
    specversion: '1.0',
    type: 'processingAccount.signature.signed',
    version: '1.0.0',
    source: 'payroc',
    id: '123e4567-e89b-12d3-a456-426614174001',
    time: '2026-05-21T11:30:00.000Z',
    datacontenttype: 'application/json',
    data: { processingAccountId: '38765', signed: 'true' },
  },
  // No documented sample payload: same CloudEvents envelope, illustrative data.
  'terminalOrder.status.changed': {
    specversion: '1.0',
    type: 'terminalOrder.status.changed',
    version: '1.0.0',
    source: 'payroc',
    id: '123e4567-e89b-12d3-a456-426614174002',
    time: '2024-07-02T15:30:00.000Z',
    datacontenttype: 'application/json',
    data: { terminalOrderId: '1234' },
  },
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(SAMPLES['processingAccount.status.changed']),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/payroc', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('Payroc-Secret verification', () => {
  it('accepts the correct secret with exactly 200', async () => {
    const res = await POST(makeRequest({ 'Payroc-Secret': SECRET }, JSON.stringify({ ...SAMPLES['processingAccount.status.changed'], id: 'ok-1' })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('matches the header name case-insensitively', async () => {
    const res = await POST(makeRequest({ 'payroc-secret': SECRET }, JSON.stringify({ ...SAMPLES['processingAccount.status.changed'], id: 'ok-2' })));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong secret of the same length', async () => {
    expect((await POST(makeRequest({ 'Payroc-Secret': 'x'.repeat(SECRET.length) }))).status).toBe(401);
  });

  it('rejects a different length without throwing', async () => {
    expect((await POST(makeRequest({ 'Payroc-Secret': 'short' }))).status).toBe(401);
  });

  it('rejects a prefix of the secret', async () => {
    expect((await POST(makeRequest({ 'Payroc-Secret': SECRET.slice(0, -1) }))).status).toBe(401);
  });

  it('rejects a missing header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('does not accept the secret as an Authorization bearer', async () => {
    expect((await POST(makeRequest({ Authorization: `Bearer ${SECRET}` }))).status).toBe(401);
  });

  it('fails closed when no secret is configured', () => {
    const headers = new Headers({ 'payroc-secret': SECRET });
    expect(verifyPayrocRequest(headers, '')).toBe(false);
    expect(verifyPayrocRequest(headers)).toBe(true);
  });
});

describe('Events', () => {
  it.each(Object.keys(SAMPLES))('handles %s', async (type) => {
    const res = await POST(makeRequest({ 'Payroc-Secret': SECRET }, JSON.stringify(SAMPLES[type])));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify({ ...SAMPLES['processingAccount.status.changed'], type: 'something.else', id: 'unknown-1' });
    expect((await POST(makeRequest({ 'Payroc-Secret': SECRET }, body))).status).toBe(200);
  });

  it('does not reprocess a duplicate id but still returns 200', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const body = JSON.stringify({ ...SAMPLES['processingAccount.status.changed'], id: 'dup-1' });
    await POST(makeRequest({ 'Payroc-Secret': SECRET }, body));
    const calls = spy.mock.calls.length;
    const res = await POST(makeRequest({ 'Payroc-Secret': SECRET }, body));
    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
    expect(spy.mock.calls.length).toBe(calls);
    spy.mockRestore();
  });
});

describe('Body handling', () => {
  it('accepts any content type', async () => {
    const body = JSON.stringify({ ...SAMPLES['processingAccount.status.changed'], id: 'ct-1' });
    expect((await POST(makeRequest({ 'Payroc-Secret': SECRET }, body, 'text/plain'))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after authentication', async () => {
    expect((await POST(makeRequest({ 'Payroc-Secret': SECRET }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ 'Payroc-Secret': SECRET }, '[]'))).status).toBe(400);
  });

  it('returns 401 for an invalid body without a secret', async () => {
    expect((await POST(makeRequest({}, 'not json'))).status).toBe(401);
  });
});
