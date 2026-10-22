import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/checkly/route';

const SECRET = 'checkly_test_secret';

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/checkly', {
    method: 'POST',
    body,
    headers,
  });
}

const payload = (alertType: string) =>
  JSON.stringify({ alertType, checkName: 'Homepage', checkId: 'a1b2c3' });

describe('Checkly webhook', () => {
  beforeEach(() => {
    process.env.CHECKLY_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['ALERT_FAILURE', 'ALERT_RECOVERY', 'ALERT_DEGRADED', 'ALERT_SSL'])(
    'accepts a validly signed %s',
    async (type) => {
      const body = payload(type);
      const res = await POST(
        makeRequest(body, {
          'content-type': 'application/json',
          'x-checkly-signature': sign(body),
          'x-checkly-timestamp': String(Date.now()),
        })
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    }
  );

  it('verifies bodies sent with any content type', async () => {
    const body = payload('ALERT_FAILURE');
    const res = await POST(
      makeRequest(body, { 'content-type': 'text/plain', 'x-checkly-signature': sign(body) })
    );
    expect(res.status).toBe(200);
  });

  it('verifies the exact raw bytes, not re-serialized JSON', async () => {
    const body = '{ "alertType":  "ALERT_FAILURE",\n "checkName": "Homepage", "checkId": "a1b2c3" }';
    const res = await POST(makeRequest(body, { 'x-checkly-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    const res = await POST(makeRequest(payload('ALERT_FAILURE')));
    expect(res.status).toBe(400);
  });

  it('rejects a wrong signature', async () => {
    const body = payload('ALERT_FAILURE');
    const res = await POST(makeRequest(body, { 'x-checkly-signature': sign(body, 'wrong_secret') }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature of the wrong length', async () => {
    const res = await POST(makeRequest(payload('ALERT_FAILURE'), { 'x-checkly-signature': 'abc' }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const signature = sign(payload('ALERT_FAILURE'));
    const res = await POST(makeRequest(payload('ALERT_RECOVERY'), { 'x-checkly-signature': signature }));
    expect(res.status).toBe(400);
  });

  it('rejects when no secret is configured', async () => {
    delete process.env.CHECKLY_WEBHOOK_SECRET;
    const body = payload('ALERT_FAILURE');
    const res = await POST(makeRequest(body, { 'x-checkly-signature': sign(body) }));
    expect(res.status).toBe(400);
  });

  it('rejects a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-checkly-signature': sign(body) }));
    expect(res.status).toBe(400);
  });
});
