const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'test_firecrawl_secret';
process.env.FIRECRAWL_WEBHOOK_SECRET = SECRET;

const { app, verifyFirecrawlWebhook } = require('../src/index');

function sign(body, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const payload = (type, extra = {}) =>
  JSON.stringify({ success: true, type, id: 'job-1', webhookId: 'wh-1', data: [], metadata: {}, ...extra });

describe('verifyFirecrawlWebhook', () => {
  const body = Buffer.from(payload('crawl.started'));

  it('accepts a valid signature', () => {
    expect(verifyFirecrawlWebhook(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyFirecrawlWebhook(body, sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyFirecrawlWebhook(Buffer.from(payload('crawl.completed')), sign(body), SECRET)).toBe(false);
  });

  it('rejects wrong algorithm, malformed, and missing headers', () => {
    expect(verifyFirecrawlWebhook(body, sign(body).replace('sha256', 'sha1'), SECRET)).toBe(false);
    expect(verifyFirecrawlWebhook(body, 'garbage', SECRET)).toBe(false);
    expect(verifyFirecrawlWebhook(body, 'sha256=abc', SECRET)).toBe(false);
    expect(verifyFirecrawlWebhook(body, undefined, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/firecrawl', () => {
  const events = [
    'crawl.started', 'crawl.page', 'crawl.completed',
    'batch_scrape.started', 'batch_scrape.page', 'batch_scrape.completed',
    'extract.started', 'extract.completed', 'extract.failed',
    'agent.completed', 'monitor.check.completed',
  ];

  it.each(events)('accepts a signed %s event', async (type) => {
    const body = payload(type);
    const res = await request(app)
      .post('/webhooks/firecrawl')
      .set('Content-Type', 'application/json')
      .set('X-Firecrawl-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = payload('crawl.page');
    const res = await request(app)
      .post('/webhooks/firecrawl')
      .set('Content-Type', 'text/plain')
      .set('X-Firecrawl-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types', async () => {
    const body = payload('something.else');
    const res = await request(app)
      .post('/webhooks/firecrawl')
      .set('Content-Type', 'application/json')
      .set('X-Firecrawl-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = payload('crawl.page');
    const res = await request(app)
      .post('/webhooks/firecrawl')
      .set('Content-Type', 'application/json')
      .set('X-Firecrawl-Signature', sign(body, 'wrong'))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/firecrawl')
      .set('Content-Type', 'application/json')
      .send(payload('crawl.page'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for signed but invalid JSON', async () => {
    const body = 'not json';
    const res = await request(app)
      .post('/webhooks/firecrawl')
      .set('Content-Type', 'text/plain')
      .set('X-Firecrawl-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(400);
  });
});
