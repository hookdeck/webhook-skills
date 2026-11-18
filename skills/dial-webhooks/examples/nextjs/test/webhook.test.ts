import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'whsec_test_dial_secret';

const now = () => Math.floor(Date.now() / 1000);

// X-Dial-Signature: t=<ts>,v1=<hex HMAC-SHA256 of `${t}.${body}`>, keyed with the full whsec_ secret
function sign(body: string, { t = now(), secret = SECRET }: { t?: number; secret?: string } = {}): string {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

function envelope(type: string, data: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'evt_3f9a2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90',
    object: 'event',
    type,
    version: type === 'number.status_changed' ? 2 : 1,
    createdAt: '2026-05-28T14:32:08.412Z',
    relatedObject: null,
    data,
  });
}

const EVENTS: [string, Record<string, unknown>][] = [
  ['message.received', { messageId: 'msg_1', from: '+14155550123', to: '+14155559876', channel: 'sms', body: 'hi', media: [] }],
  ['message.status_changed', { messageId: 'msg_1', changed: 'delivery', deliveryState: 'delivered', readState: 'unsupported' }],
  ['call.status_changed', { callId: 'call_1', status: { state: 'Ringing', label: 'Ringing' }, previousState: 'Queued' }],
  ['call.ended', { callId: 'call_1', direction: 'inbound', durationSeconds: 47, status: 'completed', canceled: false }],
  ['call.transcribed', { callId: 'call_1' }],
  ['number.status_changed', { phoneNumberId: 'pn_1', number: '+14155550123', status: 'ready', changed: [], capabilities: {} }],
  ['webhook.ping', {}],
];

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.DIAL_WEBHOOK_SECRET = SECRET;
  delete process.env.DIAL_WEBHOOK_TOLERANCE_SECONDS;
  ({ POST } = await import('../app/webhooks/dial/route'));
});

afterEach(() => {
  delete process.env.DIAL_WEBHOOK_TOLERANCE_SECONDS;
});

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/dial', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('Dial webhook route', () => {
  it.each(EVENTS)('accepts a correctly signed %s event', async (type, data) => {
    const body = envelope(type, data);
    const res = await POST(makeRequest(body, { 'x-dial-signature': sign(body), 'x-dial-event-type': type }));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong-secret signature', async () => {
    const body = envelope('message.received');
    const res = await POST(makeRequest(body, { 'x-dial-signature': sign(body, { secret: 'whsec_other' }) }));
    expect(res.status).toBe(401);
  });

  it('rejects a signature keyed without the whsec_ prefix', async () => {
    const body = envelope('message.received');
    const res = await POST(makeRequest(body, { 'x-dial-signature': sign(body, { secret: 'test_dial_secret' }) }));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const sig = sign(envelope('call.ended'));
    const res = await POST(makeRequest(envelope('call.transcribed'), { 'x-dial-signature': sig }));
    expect(res.status).toBe(401);
  });

  it('accepts an old timestamp by default (window is opt-in)', async () => {
    const body = envelope('call.ended');
    const res = await POST(makeRequest(body, { 'x-dial-signature': sign(body, { t: now() - 86400 }) }));
    expect(res.status).toBe(200);
  });

  it('rejects a stale timestamp when a tolerance is set', async () => {
    process.env.DIAL_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = envelope('call.ended');
    const res = await POST(makeRequest(body, { 'x-dial-signature': sign(body, { t: now() - 600 }) }));
    expect(res.status).toBe(401);
  });

  it('accepts a fresh timestamp when a tolerance is set', async () => {
    process.env.DIAL_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = envelope('call.ended');
    const res = await POST(makeRequest(body, { 'x-dial-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it.each(['0', 'abc', '-5'])('treats tolerance %s as off', async (value) => {
    process.env.DIAL_WEBHOOK_TOLERANCE_SECONDS = value;
    const body = envelope('call.ended');
    const res = await POST(makeRequest(body, { 'x-dial-signature': sign(body, { t: now() - 86400 }) }));
    expect(res.status).toBe(200);
  });

  it('rejects malformed signature headers', async () => {
    const body = envelope('call.ended');
    const t = now();
    const v1 = sign(body, { t }).split('v1=')[1];
    for (const bad of [v1, `t=${t}`, `t=abc,v1=${v1}`, `t=${t},v1=${'zz'.repeat(32)}`, `t=${t},v1=${v1.slice(0, 62)}`, `t=${t + 1},v1=${v1}`]) {
      const res = await POST(makeRequest(body, { 'x-dial-signature': bad }));
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(envelope('call.ended')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed non-JSON body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-dial-signature': sign(body) }));
    expect(res.status).toBe(400);
  });
});
