import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_agentline_secret';

// Bare hex HMAC-SHA256 of the raw body, keyed with the secret
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const EVENTS = [
  'call.received',
  'call.utterance',
  'call.completed',
  'call.owner_task',
  'call.failed',
  'call.busy',
  'call.no-answer',
  'call.canceled',
  'sms.received',
  'webhook.test',
];

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.AGENTLINE_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/agentline/route'));
});

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/agentline', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('AgentLine webhook route', () => {
  it.each(EVENTS)('accepts a correctly signed %s event', async (type) => {
    const body = JSON.stringify({ event_id: 'evt_1', agent_id: 'ag_1', event_type: type, payload: {} });
    const res = await POST(makeRequest(body, { 'x-webhook-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong-secret signature', async () => {
    const body = JSON.stringify({ event_type: 'call.completed' });
    const res = await POST(makeRequest(body, { 'x-webhook-signature': sign(body, 'other') }));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const sig = sign(JSON.stringify({ event_type: 'call.completed' }));
    const res = await POST(makeRequest(JSON.stringify({ event_type: 'call.failed' }), { 'x-webhook-signature': sig }));
    expect(res.status).toBe(401);
  });

  it('rejects non-hex and wrong-length signatures', async () => {
    const body = JSON.stringify({ event_type: 'call.completed' });
    for (const bad of ['zz'.repeat(32), sign(body).slice(0, 62), sign(body) + '00']) {
      const res = await POST(makeRequest(body, { 'x-webhook-signature': bad }));
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(JSON.stringify({ event_type: 'call.completed' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed non-JSON body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-webhook-signature': sign(body) }));
    expect(res.status).toBe(400);
  });
});
