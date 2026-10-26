import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'secret-key';
const DOCS_SIGNATURE = '4fdc7dcdcb02bca16c7ec4a15b9d6436de1f186e11ff155d0ab178b5aca4f30e';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.JAZZHR_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/jazzhr/route'));
});

const sign = (body: string, secret = SECRET) => crypto.createHmac('sha256', secret).update(body).digest('hex');

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/jazzhr', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/jazzhr', () => {
  it("reproduces the docs' worked example signature", () => {
    expect(sign('{"data":"JazzHR Verify Event"}')).toBe(DOCS_SIGNATURE);
  });

  it('accepts the signed VERIFY event', async () => {
    const res = await POST(
      makeRequest('{"data":"JazzHR Verify Event"}', { 'x-jazzhr-event': 'VERIFY', 'x-jazzhr-signature': DOCS_SIGNATURE })
    );
    expect(res.status).toBe(200);
  });

  it('accepts a signed CANDIDATE-EXPORT event', async () => {
    const body = JSON.stringify({ candidate: { person: { id: { value: 'c1' } } } });
    const res = await POST(makeRequest(body, { 'x-jazzhr-event': 'CANDIDATE-EXPORT', 'x-jazzhr-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify({ candidate: {} });
    const res = await POST(
      makeRequest(body, { 'content-type': 'text/plain', 'x-jazzhr-event': 'CANDIDATE-EXPORT', 'x-jazzhr-signature': sign(body) })
    );
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify({ candidate: {} });
    const res = await POST(
      makeRequest(body, { 'x-jazzhr-event': 'CANDIDATE-EXPORT', 'x-jazzhr-signature': sign(body).toUpperCase() })
    );
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify({ candidate: {} });
    const res = await POST(makeRequest(body, { 'x-jazzhr-event': 'CANDIDATE-EXPORT', 'x-jazzhr-signature': sign(body, 'other') }));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(
      makeRequest('{"candidate":{"x":1}}', { 'x-jazzhr-event': 'CANDIDATE-EXPORT', 'x-jazzhr-signature': sign('{"candidate":{}}') })
    );
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    const res = await POST(makeRequest('{"candidate":{}}', { 'x-jazzhr-event': 'CANDIDATE-EXPORT' }));
    expect(res.status).toBe(401);
  });

  it('rejects malformed hex without truncating it', async () => {
    const body = JSON.stringify({ candidate: {} });
    const good = sign(body);
    for (const bad of [good.slice(0, 62) + 'zz', good + 'ab', good.slice(0, 32), 'sha256=' + good]) {
      const res = await POST(makeRequest(body, { 'x-jazzhr-event': 'CANDIDATE-EXPORT', 'x-jazzhr-signature': bad }));
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 for a signed non-JSON export body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-jazzhr-event': 'CANDIDATE-EXPORT', 'x-jazzhr-signature': sign(body) }));
    expect(res.status).toBe(400);
  });
});
