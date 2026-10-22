import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const KEY = 'test_api_token_0123456789abcdef';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.WORKABLE_SIGNING_KEY = KEY;
  ({ POST } = await import('../app/webhooks/workable/route'));
});

const sign = (body: string, key = KEY) => crypto.createHmac('sha256', key).update(body).digest('hex');

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/workable', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/workable', () => {
  const events = ['candidate_created', 'candidate_moved', 'employee_created', 'employee_updated', 'employee_published'];

  for (const event_type of events) {
    it(`accepts a validly signed ${event_type} event`, async () => {
      const body = JSON.stringify({ id: 'abc123', event_type });
      const res = await POST(makeRequest(body, { 'x-workable-signature': sign(body) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });
  }

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify({ id: 'abc123', event_type: 'candidate_created' });
    const res = await POST(makeRequest(body, { 'content-type': 'text/plain', 'x-workable-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify({ id: 'abc123', event_type: 'candidate_created' });
    const res = await POST(makeRequest(body, { 'x-workable-signature': sign(body).toUpperCase() }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for unhandled events', async () => {
    const body = JSON.stringify({ id: 'abc123', event_type: 'job_deleted' });
    const res = await POST(makeRequest(body, { 'x-workable-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong key', async () => {
    const body = JSON.stringify({ id: 'abc123', event_type: 'candidate_created' });
    const res = await POST(makeRequest(body, { 'x-workable-signature': sign(body, 'wrong') }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const sig = sign(JSON.stringify({ id: 'abc123', event_type: 'candidate_created' }));
    const res = await POST(makeRequest(JSON.stringify({ id: 'evil', event_type: 'candidate_created' }), { 'x-workable-signature': sig }));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed signature (length mismatch)', async () => {
    const res = await POST(makeRequest(JSON.stringify({ id: 'abc123' }), { 'x-workable-signature': 'abc' }));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest(JSON.stringify({ id: 'abc123' })));
    expect(res.status).toBe(400);
  });
});
