import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'pLjUpNQu8a4YjeCrf2KseA';
process.env.DOJAH_WEBHOOK_SECRET = SECRET;

import { POST } from '../app/webhooks/dojah/route';

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function payload(verificationStatus: string, status = true): string {
  return JSON.stringify({
    reference_id: 'DJ-92F24FA662',
    verification_status: verificationStatus,
    status,
    data: { selfie: { status: true } },
  });
}

function makeRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/dojah', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('Dojah webhook route', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockClear());
  afterAll(() => vi.restoreAllMocks());

  it.each(['Ongoing', 'Pending', 'Completed', 'Failed', 'Abandoned'])(
    'accepts a validly signed %s event',
    async (verificationStatus) => {
      const body = payload(verificationStatus);
      const res = await POST(makeRequest(body, { 'x-dojah-signature': sign(body) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    }
  );

  it('treats Completed with status false as not passed', async () => {
    const body = payload('Completed', false);
    const res = await POST(makeRequest(body, { 'x-dojah-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Verification completed but not passed:', 'DJ-92F24FA662');
  });

  it('verifies regardless of Content-Type', async () => {
    const body = payload('Completed');
    const res = await POST(
      makeRequest(body, { 'content-type': 'text/plain', 'x-dojah-signature': sign(body) })
    );
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const body = payload('Completed');
    const res = await POST(makeRequest(body, { 'x-dojah-signature': sign(body).toUpperCase() }));
    expect(res.status).toBe(200);
  });

  it('acknowledges events from other services without verification_status', async () => {
    const body = JSON.stringify({ event: 'sms.delivered' });
    const res = await POST(makeRequest(body, { 'x-dojah-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('ignores wrong-typed fields instead of failing', async () => {
    const body = JSON.stringify({ reference_id: { a: 1 }, verification_status: ['Completed'], status: 'yes', data: 5 });
    const res = await POST(makeRequest(body, { 'x-dojah-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header with 401', async () => {
    const res = await POST(makeRequest(payload('Completed')));
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature header with 401', async () => {
    const res = await POST(makeRequest(payload('Completed'), { 'x-dojah-signature': '' }));
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = payload('Completed');
    const res = await POST(makeRequest(body, { 'x-dojah-signature': sign(body, 'wrong-secret') }));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(
      makeRequest(payload('Failed'), { 'x-dojah-signature': sign(payload('Completed')) })
    );
    expect(res.status).toBe(401);
  });

  it.each([
    ['too short', 'abc123'],
    ['non-hex of right length', 'z'.repeat(64)],
    ['valid hex prefix with junk suffix', sign('x').slice(0, 60) + 'zzzz'],
    ['prefixed', 'sha256=' + sign('x')],
  ])('rejects a malformed signature (%s)', async (_name, sig) => {
    const res = await POST(makeRequest(payload('Completed'), { 'x-dojah-signature': sig }));
    expect(res.status).toBe(401);
  });

  it('rejects invalid JSON that is correctly signed', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-dojah-signature': sign(body) }));
    expect(res.status).toBe(400);
  });

  it.each(['[1,2]', '"text"', 'null', '7'])('rejects a signed non-object body (%s)', async (body) => {
    const res = await POST(makeRequest(body, { 'x-dojah-signature': sign(body) }));
    expect(res.status).toBe(400);
  });
});
