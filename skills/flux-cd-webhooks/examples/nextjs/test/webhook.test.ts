import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/flux-cd/route';

const secret = 'test_flux_cd_token';

beforeAll(() => {
  process.env.FLUX_CD_WEBHOOK_SECRET = secret;
});

// Payload as shown in the Flux notification-controller docs (generic webhook)
const errorEvent = {
  involvedObject: {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    name: 'webapp',
    namespace: 'apps',
    uid: '7d0cdc51-ddcf-4743-b223-83ca5c699632',
  },
  metadata: { 'kustomize.toolkit.fluxcd.io/revision': 'main/731f7eaddfb6af01cb2173e18f0f75b0ba780ef1' },
  severity: 'error',
  reason: 'ValidationFailed',
  message: 'service/apps/webapp validation error: spec.type: Unsupported value: Ingress',
  reportingController: 'kustomize-controller',
  reportingInstance: 'kustomize-controller-7c7b47f5f-8bhrp',
  timestamp: '2022-10-28T07:26:19Z',
};
const infoEvent = { ...errorEvent, severity: 'info', reason: 'ReconciliationSucceeded', message: 'Reconciliation finished' };

// Flux's X-Signature is `sha256=` + hex HMAC-SHA256 of the raw body
function sign(payload: string, key: string = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function makeRequest(body: string, signature?: string | null): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const sig = signature === undefined ? `sha256=${sign(body)}` : signature;
  if (sig !== null) headers['x-signature'] = sig;
  return new NextRequest('http://localhost:3000/webhooks/flux-cd', { method: 'POST', headers, body });
}

describe('POST /webhooks/flux-cd', () => {
  it('returns 401 for a missing signature', async () => {
    const response = await POST(makeRequest(JSON.stringify(errorEvent), null));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an empty signature', async () => {
    expect((await POST(makeRequest(JSON.stringify(errorEvent), ''))).status).toBe(401);
  });

  it('returns 401 for a malformed or wrong-length signature', async () => {
    const body = JSON.stringify(errorEvent);
    expect((await POST(makeRequest(body, 'sha256=deadbeef'))).status).toBe(401);
    expect((await POST(makeRequest(body, `sha256=zz${sign(body).slice(2)}`))).status).toBe(401);
  });

  it('returns 401 for other hash functions', async () => {
    const body = JSON.stringify(errorEvent);
    const sha512 = crypto.createHmac('sha512', secret).update(body).digest('hex');
    expect((await POST(makeRequest(body, `sha512=${sha512}`))).status).toBe(401);
  });

  it('returns 401 for a signature made with the wrong secret', async () => {
    const body = JSON.stringify(errorEvent);
    expect((await POST(makeRequest(body, `sha256=${sign(body, 'wrong_secret')}`))).status).toBe(401);
  });

  it('returns 401 when the body is changed after signing', async () => {
    const signature = `sha256=${sign(JSON.stringify(errorEvent))}`;
    expect((await POST(makeRequest(JSON.stringify(infoEvent), signature))).status).toBe(401);
  });

  it.each([
    ['error', errorEvent],
    ['info', infoEvent],
  ])('returns 200 for a valid %s event', async (_severity, event) => {
    const response = await POST(makeRequest(JSON.stringify(event)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('verifies the exact bytes, including non-canonical JSON formatting', async () => {
    const body = JSON.stringify(errorEvent, null, 2);
    expect((await POST(makeRequest(body))).status).toBe(200);
  });

  it('accepts a bare hex signature and uppercase hex', async () => {
    const body = JSON.stringify(infoEvent);
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
    expect((await POST(makeRequest(body, `sha256=${sign(body).toUpperCase()}`))).status).toBe(200);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const response = await POST(makeRequest('not json'));
    expect(response.status).toBe(400);
  });
});
