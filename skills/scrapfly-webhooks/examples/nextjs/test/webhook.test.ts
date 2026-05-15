import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';
import { POST } from '../app/webhooks/scrapfly/route';

const secret = process.env.SCRAPFLY_WEBHOOK_SECRET!;

function generateScrapflySignature(rawBody: string | Buffer | Uint8Array, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex').toUpperCase();
}

function makeRequest(body: string | Buffer | Uint8Array, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/scrapfly', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

describe('Scrapfly Webhook Endpoint (Next.js)', () => {
  it('returns 401 when signature header is missing', async () => {
    const body = JSON.stringify({ result: { status_code: 200 } });
    const res = await POST(makeRequest(body, {
      'X-Scrapfly-Webhook-Resource-Type': 'scrape',
    }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it('returns 401 when signature is invalid', async () => {
    const body = JSON.stringify({ result: { status_code: 200 } });
    const res = await POST(makeRequest(body, {
      'X-Scrapfly-Webhook-Signature': 'DEADBEEF',
      'X-Scrapfly-Webhook-Resource-Type': 'scrape',
    }));

    expect(res.status).toBe(401);
  });

  it('returns 401 when body is tampered after signing', async () => {
    const originalBody = JSON.stringify({ result: { status_code: 200 } });
    const sig = generateScrapflySignature(originalBody, secret);

    const tampered = JSON.stringify({ result: { status_code: 500 } });
    const res = await POST(makeRequest(tampered, {
      'X-Scrapfly-Webhook-Signature': sig,
      'X-Scrapfly-Webhook-Resource-Type': 'scrape',
    }));

    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid scrape webhook', async () => {
    const body = JSON.stringify({
      result: { url: 'https://web-scraping.dev/products', status_code: 200 },
      context: {
        webhook: { name: 'my-webhook', secret, consecutive_failed_count: 0 },
        job: { uuid: '550e8400-e29b-41d4-a716-446655440000' },
      },
    });
    const sig = generateScrapflySignature(body, secret);

    const res = await POST(makeRequest(body, {
      'X-Scrapfly-Webhook-Signature': sig,
      'X-Scrapfly-Webhook-Resource-Type': 'scrape',
      'X-Scrapfly-Webhook-Id': 'wh_test_1',
      'X-Scrapfly-Webhook-Job-Id': 'job_test_1',
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 200 for a valid extraction webhook (data lives at payload.data, not payload.result.data)', async () => {
    // Real extraction body shape from a live capture:
    //   { content_type, data: {...}, context: {...} }
    const body = JSON.stringify({
      content_type: 'application/json',
      data: { price: '$19.99', product_name: 'Widget', stock: 'In stock' },
    });
    const sig = generateScrapflySignature(body, secret);

    const res = await POST(makeRequest(body, {
      'X-Scrapfly-Webhook-Signature': sig,
      'X-Scrapfly-Webhook-Resource-Type': 'extraction',
    }));

    expect(res.status).toBe(200);
  });

  it('returns 200 for a screenshot webhook with a BINARY body (not JSON)', async () => {
    // Scrapfly Screenshot deliveries carry raw image bytes (JPEG/PNG/WebP/GIF),
    // NOT JSON — even though Content-Type says application/json (upstream
    // Scrapfly quirk). The handler must dispatch on the resource type header
    // BEFORE JSON.parse to avoid blowing up after signature verification.
    const binaryBody = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const sig = generateScrapflySignature(binaryBody, secret);

    const res = await POST(makeRequest(binaryBody, {
      'X-Scrapfly-Webhook-Signature': sig,
      'X-Scrapfly-Webhook-Resource-Type': 'screenshot',
    }));

    expect(res.status).toBe(200);
  });

  it.each([
    'crawler_started',
    'crawler_url_visited',
    'crawler_url_discovered',
    'crawler_url_skipped',
    'crawler_url_failed',
    'crawler_stopped',
    'crawler_cancelled',
    'crawler_finished',
  ])('returns 200 for crawler event %s', async (event) => {
    const body = JSON.stringify({
      event,
      payload: {
        crawler_uuid: '550e8400-e29b-41d4-a716-446655440000',
        url: 'https://web-scraping.dev/page',
      },
    });
    const sig = generateScrapflySignature(body, secret);

    const res = await POST(makeRequest(body, {
      'X-Scrapfly-Webhook-Signature': sig,
      'X-Scrapfly-Crawl-Event-Name': event,
    }));

    expect(res.status).toBe(200);
  });

  it('accepts a lowercase-hex signature (X-Scrapfly-Webhook-Signature-Lowercase variant)', async () => {
    const body = JSON.stringify({ result: { status_code: 200 } });
    const sig = generateScrapflySignature(body, secret).toLowerCase();

    const res = await POST(makeRequest(body, {
      'X-Scrapfly-Webhook-Signature': sig,
      'X-Scrapfly-Webhook-Resource-Type': 'scrape',
    }));

    expect(res.status).toBe(200);
  });

  it('returns 400 when body is not valid JSON', async () => {
    const malformed = '{ not json';
    const sig = generateScrapflySignature(malformed, secret);

    const res = await POST(makeRequest(malformed, {
      'X-Scrapfly-Webhook-Signature': sig,
      'X-Scrapfly-Webhook-Resource-Type': 'scrape',
    }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON payload' });
  });

  it('returns 500 if SCRAPFLY_WEBHOOK_SECRET is not set', async () => {
    const original = process.env.SCRAPFLY_WEBHOOK_SECRET;
    delete process.env.SCRAPFLY_WEBHOOK_SECRET;
    try {
      const res = await POST(makeRequest('{}'));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Webhook secret not configured' });
    } finally {
      process.env.SCRAPFLY_WEBHOOK_SECRET = original;
    }
  });
});
