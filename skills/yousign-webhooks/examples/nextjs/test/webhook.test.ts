import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_yousign_webhook_secret';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.YOUSIGN_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/yousign/route'));
});

function sign(body: string, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function payload(eventName: string, data: object = {}) {
  return JSON.stringify({
    event_id: 'b6c63685-c556-4a30-8fe9-b6f2b187d936',
    event_name: eventName,
    event_time: '1670855889',
    subscription_id: 'sub_123',
    subscription_description: 'test',
    sandbox: true,
    data,
  });
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/webhooks/yousign', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('Yousign webhook', () => {
  const events: [string, object][] = [
    ['signature_request.activated', { signature_request: { id: 'sr_1' } }],
    ['signature_request.done', { signature_request: { id: 'sr_1' } }],
    ['signature_request.declined', { signature_request: { id: 'sr_1' } }],
    ['signer.done', { signer: { id: 's_1' } }],
    ['signer.declined', { signer: { id: 's_1' } }],
  ];

  it.each(events)('accepts valid %s', async (name, data) => {
    const body = payload(name, data);
    const res = await POST(makeRequest(body, { 'x-yousign-signature-256': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies any content type (raw body)', async () => {
    const body = payload('signer.done');
    const res = await POST(
      makeRequest(body, { 'content-type': 'text/plain', 'x-yousign-signature-256': sign(body) })
    );
    expect(res.status).toBe(200);
  });

  it('rejects missing signature', async () => {
    const res = await POST(makeRequest(payload('signer.done')));
    expect(res.status).toBe(400);
  });

  it('rejects wrong secret', async () => {
    const body = payload('signer.done');
    const res = await POST(makeRequest(body, { 'x-yousign-signature-256': sign(body, 'wrong') }));
    expect(res.status).toBe(400);
  });

  it('rejects tampered body', async () => {
    const body = payload('signer.done');
    const res = await POST(
      makeRequest(body.replace('sub_123', 'sub_999'), { 'x-yousign-signature-256': sign(body) })
    );
    expect(res.status).toBe(400);
  });

  it('rejects signature without sha256= prefix', async () => {
    const body = payload('signer.done');
    const bare = sign(body).slice('sha256='.length);
    const res = await POST(makeRequest(body, { 'x-yousign-signature-256': bare }));
    expect(res.status).toBe(400);
  });

  it('rejects valid signature over invalid JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-yousign-signature-256': sign(body) }));
    expect(res.status).toBe(400);
  });
});
