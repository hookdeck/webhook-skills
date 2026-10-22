import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_firecrawl_secret';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.FIRECRAWL_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/firecrawl/route'));
});

function sign(body: string, secret = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const payload = (type: string) =>
  JSON.stringify({ success: true, type, id: 'job-1', webhookId: 'wh-1', data: [], metadata: {} });

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/firecrawl', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('Firecrawl webhook route', () => {
  const events = [
    'crawl.started', 'crawl.page', 'crawl.completed',
    'batch_scrape.started', 'batch_scrape.page', 'batch_scrape.completed',
    'extract.started', 'extract.completed', 'extract.failed',
    'agent.completed', 'monitor.check.completed',
  ];

  it.each(events)('accepts a signed %s event', async (type) => {
    const body = payload(type);
    const res = await POST(makeRequest(body, { 'x-firecrawl-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = payload('crawl.page');
    const res = await POST(makeRequest(body, { 'content-type': 'text/plain', 'x-firecrawl-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types', async () => {
    const body = payload('something.else');
    const res = await POST(makeRequest(body, { 'x-firecrawl-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = payload('crawl.page');
    const res = await POST(makeRequest(body, { 'x-firecrawl-signature': sign(body, 'wrong') }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered body', async () => {
    const res = await POST(makeRequest(payload('crawl.completed'), { 'x-firecrawl-signature': sign(payload('crawl.page')) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for wrong algorithm or malformed header', async () => {
    const body = payload('crawl.page');
    for (const h of [sign(body).replace('sha256', 'sha1'), 'garbage', 'sha256=abc']) {
      const res = await POST(makeRequest(body, { 'x-firecrawl-signature': h }));
      expect(res.status).toBe(400);
    }
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(payload('crawl.page')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for signed but invalid JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-firecrawl-signature': sign(body) }));
    expect(res.status).toBe(400);
  });
});
