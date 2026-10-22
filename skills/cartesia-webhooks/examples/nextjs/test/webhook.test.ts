import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

const SECRET = 'test_cartesia_webhook_secret_0123456789';

let POST: (req: NextRequest) => Promise<Response>;
let verifyCartesiaRequest: (headers: Headers, secret?: string) => boolean;

beforeAll(async () => {
  process.env.CARTESIA_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/cartesia/route'));
  ({ verifyCartesiaRequest } = await import('../lib/verify-cartesia'));
});

// Shapes follow the Cartesia docs' envelope: type, call_id, agent_id, webhook_id, webhook_request_id, timestamp
function samplePayload(type = 'call_completed', requestId = `webhook_req_${Math.random()}`) {
  const base = {
    type,
    call_id: 'ac_test_123',
    agent_id: 'agent_demo',
    webhook_id: 'agent_webhook_test',
    webhook_request_id: requestId,
    timestamp: '2026-01-01T00:00:00.000000000Z',
  };
  if (type === 'call_turn') return { ...base, turn: { id: 0, role: 'user', text: 'Hello' } };
  if (type === 'post_call_analysis') return { ...base, analysis: { summary: 'A short call.' } };
  return { ...base, call: { id: 'ac_test_123', status: type.replace('call_', ''), end_reason: 'client_hangup' } };
}

function makeRequest(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/cartesia', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

const send = (payload: unknown, headers: Record<string, string> = { 'x-webhook-secret': SECRET }) =>
  POST(makeRequest(JSON.stringify(payload), headers));

describe('Cartesia webhook route', () => {
  describe('x-webhook-secret verification', () => {
    it('accepts the correct secret', async () => {
      const res = await send(samplePayload());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('rejects a missing header', async () => {
      expect((await send(samplePayload(), {})).status).toBe(401);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await send(samplePayload(), { 'x-webhook-secret': 'x'.repeat(SECRET.length) });
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      expect((await send(samplePayload(), { 'x-webhook-secret': 'short' })).status).toBe(401);
    });

    it('does not accept a prefixed secret (Cartesia sends it raw)', async () => {
      expect((await send(samplePayload(), { 'x-webhook-secret': `Bearer ${SECRET}` })).status).toBe(401);
    });

    it('verifies regardless of content type', async () => {
      const req = makeRequest(JSON.stringify(samplePayload()), { 'x-webhook-secret': SECRET }, 'text/plain');
      expect((await POST(req)).status).toBe(200);
    });
  });

  describe('Request handling', () => {
    it('returns 400 for an invalid JSON body', async () => {
      const res = await POST(makeRequest('{not json', { 'x-webhook-secret': SECRET }));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest('[1,2,3]', { 'x-webhook-secret': SECRET }));
      expect(res.status).toBe(400);
    });

    it('handles every documented event type and unknown types', async () => {
      const types = ['call_started', 'call_completed', 'call_failed', 'call_turn', 'post_call_analysis', 'something_else'];
      for (const type of types) {
        const res = await send(samplePayload(type));
        expect(res.status).toBe(200);
        expect((await res.json()).duplicate).toBeUndefined();
      }
    });

    it('skips a retried event with the same webhook_request_id', async () => {
      const payload = samplePayload('call_started', 'webhook_req_retry_1');
      const first = await send(payload);
      const second = await send(payload);
      expect(await first.json()).toEqual({ received: true });
      expect(await second.json()).toEqual({ received: true, duplicate: true });
    });
  });

  describe('verifyCartesiaRequest', () => {
    it('rejects everything when no secret is configured', () => {
      expect(verifyCartesiaRequest(new Headers({ 'x-webhook-secret': '' }), '')).toBe(false);
      expect(verifyCartesiaRequest(new Headers({ 'x-webhook-secret': 'anything' }), undefined as unknown as string)).toBe(false);
    });
  });
});
