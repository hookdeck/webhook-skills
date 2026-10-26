import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/onespan/route';
import { verifyOneSpanRequest } from '../lib/verify-onespan';

const AUTH = 'Basic myCallbackKey#1';

beforeAll(() => {
  process.env.ONESPAN_AUTHORIZATION = AUTH;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Shapes taken from OneSpan's documented callback payloads
const packageComplete = {
  '@class': 'com.silanis.esl.packages.event.ESLProcessEvent',
  name: 'PACKAGE_COMPLETE',
  sessionUser: 'e00696ec-d6f5-4feb-89c5-a5ce002a6c66',
  packageId: '5n4obeO8jYoPp126Cm-Y3fxdfbo=',
  message: null,
  documentId: null,
  createdDate: '2018-06-30T20:15:01.038Z',
};
const documentSigned = { ...packageComplete, name: 'DOCUMENT_SIGNED', documentId: 'default-consent' };
const signerComplete = { ...packageComplete, name: 'SIGNER_COMPLETE' };

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(packageComplete),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/onespan', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('OneSpan webhook route', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong key', async () => {
    expect((await POST(makeRequest({ Authorization: 'Basic wrongKey' }))).status).toBe(401);
  });

  it('rejects the key without the "Basic " prefix', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH.replace('Basic ', '') }));
    expect(res.status).toBe(401);
  });

  it('does not decode the key as HTTP Basic (base64)', async () => {
    const encoded = 'Basic ' + Buffer.from('myCallbackKey#1').toString('base64');
    expect((await POST(makeRequest({ Authorization: encoded }))).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(documentSigned), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, '[1,2]'))).status).toBe(400);
  });

  it('does not parse the body before authenticating', async () => {
    expect((await POST(makeRequest({}, 'not json'))).status).toBe(401);
  });

  it('accepts documented events and unknown event names', async () => {
    for (const body of [documentSigned, signerComplete, { ...packageComplete, name: 'PACKAGE_DECLINE', message: 'reason' }]) {
      expect((await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(body)))).status).toBe(200);
    }
    expect((await POST(makeRequest({ Authorization: AUTH }, '{"name":"SOMETHING_NEW"}'))).status).toBe(200);
  });
});

describe('helpers', () => {
  it('never accepts when ONESPAN_AUTHORIZATION is unset', () => {
    expect(verifyOneSpanRequest(new Headers({ Authorization: 'Basic x' }), {})).toBe(false);
    expect(
      verifyOneSpanRequest(new Headers({ Authorization: '' }), { ONESPAN_AUTHORIZATION: '' })
    ).toBe(false);
  });
});
