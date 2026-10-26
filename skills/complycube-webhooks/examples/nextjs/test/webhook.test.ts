import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/complycube/route';
import { verifyComplyCubeSignature } from '../lib/complycube';

const SECRET = 'complycube_test_webhook_secret';

function sign(body: string, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Shape taken from ComplyCube's documented sample event
function makeEvent(type: string, resourceType = 'check') {
  return JSON.stringify({
    id: '5ed170fe99c81a0007b9a3d3',
    type,
    resourceType,
    payload: {
      id: '5ed3918fbf06f30008e552c9',
      outcome: 'clear',
      status: 'complete',
      createdAt: '2020-01-01T11:14:23.964Z',
      updatedAt: '2020-01-01T11:14:23.964Z',
    },
    createdAt: '2020-01-01T11:14:23.964Z',
  });
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/complycube', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

const body = makeEvent('check.completed.clear');

beforeAll(() => {
  process.env.COMPLYCUBE_WEBHOOK_SECRET = SECRET;
});

describe('verifyComplyCubeSignature', () => {
  it('accepts a valid signature, in either hex case', () => {
    expect(verifyComplyCubeSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
    expect(verifyComplyCubeSignature(Buffer.from(body), sign(body).toUpperCase(), SECRET)).toBe(true);
  });
  it('rejects wrong secret, missing header, bad hex, wrong length, prefix', () => {
    expect(verifyComplyCubeSignature(Buffer.from(body), sign(body, 'other'), SECRET)).toBe(false);
    expect(verifyComplyCubeSignature(Buffer.from(body), null, SECRET)).toBe(false);
    expect(verifyComplyCubeSignature(Buffer.from(body), '', SECRET)).toBe(false);
    expect(verifyComplyCubeSignature(Buffer.from(body), 'zz'.repeat(32), SECRET)).toBe(false);
    expect(verifyComplyCubeSignature(Buffer.from(body), 'abcd', SECRET)).toBe(false);
    expect(verifyComplyCubeSignature(Buffer.from(body), 'sha256=' + sign(body), SECRET)).toBe(false);
  });
});

describe('POST /webhooks/complycube', () => {
  it.each([
    ['check.completed.clear', 'check'],
    ['check.completed', 'check'],
    ['check.failed', 'check'],
    ['client.created', 'client'],
    ['workflow.session.completed', 'workflowSession'],
    ['address.created', 'address'],
  ])('accepts a signed %s event', async (type, resourceType) => {
    const payload = makeEvent(type, resourceType);
    const res = await POST(makeRequest(payload, { 'complycube-signature': sign(payload) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies the exact bytes, including non-compact JSON and other content types', async () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    const res = await POST(makeRequest(pretty, { 'content-type': 'text/plain', 'complycube-signature': sign(pretty) }));
    expect(res.status).toBe(200);
  });

  it('rejects an unsigned request with 401', async () => {
    expect((await POST(makeRequest(body))).status).toBe(401);
  });

  it('rejects a bad signature with 401', async () => {
    expect((await POST(makeRequest(body, { 'complycube-signature': sign(body, 'wrong') }))).status).toBe(401);
  });

  it('rejects a malformed signature with 401', async () => {
    expect((await POST(makeRequest(body, { 'complycube-signature': 'not-hex' }))).status).toBe(401);
  });

  it('rejects a tampered body with 401', async () => {
    const res = await POST(makeRequest(body.replace('clear', 'rejected'), { 'complycube-signature': sign(body) }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed but malformed JSON body', async () => {
    const bad = '{not json';
    expect((await POST(makeRequest(bad, { 'complycube-signature': sign(bad) }))).status).toBe(400);
  });

  it.each(['null', '42', '{"id":"x"}'])('returns 400 for a signed body that is not an event: %s', async (bad) => {
    expect((await POST(makeRequest(bad, { 'complycube-signature': sign(bad) }))).status).toBe(400);
  });
});
