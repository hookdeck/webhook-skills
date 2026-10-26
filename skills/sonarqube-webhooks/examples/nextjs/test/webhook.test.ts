import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { verifySonarQubeSignature } from '../lib/verify-sonarqube';
import { POST } from '../app/webhooks/sonarqube/route';

const SECRET = 'test_sonarqube_secret';

beforeEach(() => {
  process.env.SONARQUBE_WEBHOOK_SECRET = SECRET;
});

/**
 * Sign like SonarQube: bare lowercase hex(HMAC-SHA256(secret, rawBody))
 */
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function makeRequest(body: string, signature?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (signature !== undefined) headers['X-Sonar-Webhook-HMAC-SHA256'] = signature;
  return new Request('http://localhost/webhooks/sonarqube', {
    method: 'POST',
    headers,
    body,
  }) as unknown as NextRequest;
}

const failedPayload = JSON.stringify({
  taskId: 'AVh21JS2JepAEhwQ-b3u',
  status: 'SUCCESS',
  analysedAt: '2026-10-26T09:30:00+0000',
  project: { key: 'my_project', name: 'My Project' },
  qualityGate: { name: 'Sonar way', status: 'ERROR', conditions: [] },
  properties: {},
});

const passedPayload = JSON.stringify({
  taskId: 'AVh21JS2JepAEhwQ-b3v',
  status: 'SUCCESS',
  project: { key: 'my_project' },
  qualityGate: { name: 'Sonar way', status: 'OK', conditions: [] },
});

describe('verifySonarQubeSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifySonarQubeSignature(failedPayload, sign(failedPayload), SECRET)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifySonarQubeSignature(failedPayload, sign(failedPayload).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifySonarQubeSignature(failedPayload, sign(failedPayload, 'other'), SECRET)).toBe(false);
  });

  it('rejects a modified body', () => {
    expect(verifySonarQubeSignature(failedPayload + ' ', sign(failedPayload), SECRET)).toBe(false);
  });

  it('rejects non-hex, short, long, prefixed and empty signatures', () => {
    const good = sign(failedPayload);
    expect(verifySonarQubeSignature(failedPayload, 'z'.repeat(64), SECRET)).toBe(false);
    expect(verifySonarQubeSignature(failedPayload, good.slice(0, 62), SECRET)).toBe(false);
    expect(verifySonarQubeSignature(failedPayload, good + '00', SECRET)).toBe(false);
    expect(verifySonarQubeSignature(failedPayload, `sha256=${good}`, SECRET)).toBe(false);
    expect(verifySonarQubeSignature(failedPayload, '', SECRET)).toBe(false);
    expect(verifySonarQubeSignature(failedPayload, null, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/sonarqube', () => {
  it('accepts a failed quality gate with a valid signature', async () => {
    const res = await POST(makeRequest(failedPayload, sign(failedPayload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a passed quality gate', async () => {
    const res = await POST(makeRequest(passedPayload, sign(passedPayload)));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes for any content type', async () => {
    const res = await POST(makeRequest(failedPayload, sign(failedPayload), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('verifies non-canonical JSON bytes exactly as received', async () => {
    const spaced = '{ "taskId" : "t1",  "qualityGate": {"status":"OK"} }';
    const res = await POST(makeRequest(spaced, sign(spaced)));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header with 401', async () => {
    const res = await POST(makeRequest(failedPayload));
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature header with 401', async () => {
    const res = await POST(makeRequest(failedPayload, ''));
    expect(res.status).toBe(401);
  });

  it('rejects a malformed signature with 401', async () => {
    const res = await POST(makeRequest(failedPayload, 'not-hex'));
    expect(res.status).toBe(401);
  });

  it('rejects a signature from the wrong secret with 401', async () => {
    const res = await POST(makeRequest(failedPayload, sign(failedPayload, 'other')));
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid JSON body with a valid signature', async () => {
    const res = await POST(makeRequest('not json', sign('not json')));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.SONARQUBE_WEBHOOK_SECRET;
    const res = await POST(makeRequest(failedPayload, sign(failedPayload)));
    expect(res.status).toBe(500);
  });
});
