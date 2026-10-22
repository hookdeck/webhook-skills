import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_tawk_webhook_secret';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.TAWK_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/tawk-to/route'));
});

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha1', secret).update(body).digest('hex');
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature) headers['x-tawk-signature'] = signature;
  return new NextRequest('http://localhost/webhooks/tawk-to', { method: 'POST', headers, body });
}

describe('tawk.to webhook route', () => {
  const events: Record<string, object> = {
    'chat:start': { event: 'chat:start', chatId: 'c1', visitor: { name: 'V1' } },
    'chat:end': { event: 'chat:end', chatId: 'c1' },
    'chat:transcript_created': { event: 'chat:transcript_created', chat: { id: 'c1', messages: [] } },
    'ticket:create': { event: 'ticket:create', ticket: { id: 't1', subject: 'Hi' } },
  };

  for (const [name, payload] of Object.entries(events)) {
    it(`accepts a signed ${name} event`, async () => {
      const body = JSON.stringify(payload);
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
    });
  }

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(events['chat:start']);
    expect((await POST(makeRequest(body, sign(body), 'text/plain'))).status).toBe(200);
  });

  it('accepts unknown events', async () => {
    const body = JSON.stringify({ event: 'other:event' });
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify(events['chat:start']);
    expect((await POST(makeRequest(body, sign(body, 'wrong')))).status).toBe(400);
  });

  it('rejects a tampered body and a length-mismatched signature', async () => {
    const body = JSON.stringify(events['chat:start']);
    expect((await POST(makeRequest(body + ' ', sign(body)))).status).toBe(400);
    expect((await POST(makeRequest(body, 'abc'))).status).toBe(400);
  });

  it('rejects a missing signature', async () => {
    const body = JSON.stringify(events['chat:start']);
    expect((await POST(makeRequest(body))).status).toBe(400);
  });

  it('rejects signed invalid JSON', async () => {
    expect((await POST(makeRequest('not json', sign('not json')))).status).toBe(400);
  });
});
