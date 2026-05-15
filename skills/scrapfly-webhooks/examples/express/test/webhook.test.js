const request = require('supertest');
const crypto = require('crypto');

process.env.SCRAPFLY_WEBHOOK_SECRET = 'test_scrapfly_signing_secret';

const { app, verifyScrapflySignature } = require('../src/index');

/**
 * Generate a Scrapfly signature exactly as Scrapfly does:
 * upper(hex(HMAC_SHA256(secret, rawBody)))
 */
function generateScrapflySignature(rawBody, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
    .toUpperCase();
}

describe('Scrapfly Webhook Endpoint', () => {
  const secret = process.env.SCRAPFLY_WEBHOOK_SECRET;

  describe('verifyScrapflySignature', () => {
    it('returns true for a valid uppercase-hex signature', () => {
      const body = Buffer.from('{"event":"crawler_finished"}');
      const sig = generateScrapflySignature(body, secret);
      expect(verifyScrapflySignature(body, sig, secret)).toBe(true);
    });

    it('returns true for a lowercase-hex signature (the -Lowercase variant)', () => {
      const body = Buffer.from('{"event":"crawler_finished"}');
      const sig = generateScrapflySignature(body, secret).toLowerCase();
      expect(verifyScrapflySignature(body, sig, secret)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      const body = Buffer.from('{"event":"crawler_finished"}');
      expect(verifyScrapflySignature(body, 'AABBCC', secret)).toBe(false);
    });

    it('returns false for a missing signature', () => {
      const body = Buffer.from('{}');
      expect(verifyScrapflySignature(body, null, secret)).toBe(false);
    });

    it('returns false for a missing secret', () => {
      const body = Buffer.from('{}');
      const sig = generateScrapflySignature(body, secret);
      expect(verifyScrapflySignature(body, sig, '')).toBe(false);
    });

    it('returns false for non-hex signature data', () => {
      const body = Buffer.from('{}');
      expect(verifyScrapflySignature(body, 'NOT_HEX!!', secret)).toBe(false);
    });
  });

  describe('POST /webhooks/scrapfly', () => {
    it('returns 401 when signature is missing', async () => {
      const res = await request(app)
        .post('/webhooks/scrapfly')
        .set('Content-Type', 'application/json')
        .set('X-Scrapfly-Webhook-Resource-Type', 'scrape')
        .send('{"result":{"status_code":200}}');

      expect(res.status).toBe(401);
      expect(res.text).toBe('Invalid signature');
    });

    it('returns 401 when signature is invalid', async () => {
      const body = JSON.stringify({ result: { status_code: 200 } });
      const res = await request(app)
        .post('/webhooks/scrapfly')
        .set('Content-Type', 'application/json')
        .set('X-Scrapfly-Webhook-Signature', 'DEADBEEF')
        .set('X-Scrapfly-Webhook-Resource-Type', 'scrape')
        .send(body);

      expect(res.status).toBe(401);
    });

    it('returns 401 when the body has been tampered after signing', async () => {
      const originalBody = JSON.stringify({ result: { status_code: 200 } });
      const sig = generateScrapflySignature(Buffer.from(originalBody), secret);

      const tamperedBody = JSON.stringify({ result: { status_code: 500 } });
      const res = await request(app)
        .post('/webhooks/scrapfly')
        .set('Content-Type', 'application/json')
        .set('X-Scrapfly-Webhook-Signature', sig)
        .set('X-Scrapfly-Webhook-Resource-Type', 'scrape')
        .send(tamperedBody);

      expect(res.status).toBe(401);
    });

    it('returns 200 for a valid scrape webhook', async () => {
      const body = JSON.stringify({
        result: {
          url: 'https://web-scraping.dev/products',
          status_code: 200,
          content: '<html></html>',
        },
        context: {
          webhook: { name: 'my-webhook', secret: 'test_scrapfly_signing_secret', consecutive_failed_count: 0 },
          job: { uuid: '550e8400-e29b-41d4-a716-446655440000' },
        },
      });
      const sig = generateScrapflySignature(Buffer.from(body), secret);

      const res = await request(app)
        .post('/webhooks/scrapfly')
        .set('Content-Type', 'application/json')
        .set('X-Scrapfly-Webhook-Signature', sig)
        .set('X-Scrapfly-Webhook-Resource-Type', 'scrape')
        .set('X-Scrapfly-Webhook-Id', 'wh_test_1')
        .set('X-Scrapfly-Webhook-Job-Id', 'job_test_1')
        .send(body);

      expect(res.status).toBe(200);
      expect(res.text).toBe('OK');
    });

    it('returns 200 for a valid extraction webhook (data lives at payload.data, not payload.result.data)', async () => {
      // Real extraction body shape from a live capture:
      //   { content_type, data: {...}, context: {...} }
      const body = JSON.stringify({
        content_type: 'application/json',
        data: { price: '$19.99', product_name: 'Widget', stock: 'In stock' },
      });
      const sig = generateScrapflySignature(Buffer.from(body), secret);

      const res = await request(app)
        .post('/webhooks/scrapfly')
        .set('Content-Type', 'application/json')
        .set('X-Scrapfly-Webhook-Signature', sig)
        .set('X-Scrapfly-Webhook-Resource-Type', 'extraction')
        .send(body);

      expect(res.status).toBe(200);
    });

    it('returns 200 for a screenshot webhook with a BINARY body (not JSON)', async () => {
      // Scrapfly Screenshot deliveries carry raw image bytes (JPEG/PNG/WebP/GIF),
      // NOT JSON — even though Scrapfly lies in the Content-Type header by
      // sending `application/json` for screenshot payloads (upstream quirk).
      // The handler must dispatch on the resource type header BEFORE JSON.parse,
      // otherwise the parse blows up after signature verification has already
      // succeeded.
      //
      // Test note: we use `application/octet-stream` here so supertest doesn't
      // auto-JSON-stringify the Buffer. The handler ignores Content-Type and
      // reads the raw body via express.raw({ type: '*/*' }), so this is
      // equivalent to the real on-wire scenario as far as the handler's
      // dispatch logic is concerned.
      //
      // Minimal 1×1 JPEG (12 bytes — JFIF/SOI header is enough; we never
      // decode the image, just verify the handler tolerates binary).
      const binaryBody = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      const sig = generateScrapflySignature(binaryBody, secret);

      const res = await request(app)
        .post('/webhooks/scrapfly')
        .set('Content-Type', 'application/octet-stream')
        .set('X-Scrapfly-Webhook-Signature', sig)
        .set('X-Scrapfly-Webhook-Resource-Type', 'screenshot')
        .send(binaryBody);

      expect(res.status).toBe(200);
    });

    it('rejects a screenshot delivery with an invalid signature', async () => {
      const binaryBody = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

      const res = await request(app)
        .post('/webhooks/scrapfly')
        .set('Content-Type', 'application/octet-stream')
        .set('X-Scrapfly-Webhook-Signature', 'AABBCCDD')
        .set('X-Scrapfly-Webhook-Resource-Type', 'screenshot')
        .send(binaryBody);

      expect(res.status).toBe(401);
    });

    const crawlerEvents = [
      'crawler_started',
      'crawler_url_visited',
      'crawler_url_discovered',
      'crawler_url_skipped',
      'crawler_url_failed',
      'crawler_stopped',
      'crawler_cancelled',
      'crawler_finished',
    ];

    crawlerEvents.forEach((event) => {
      it(`returns 200 for crawler event ${event}`, async () => {
        const body = JSON.stringify({
          event,
          payload: {
            crawler_uuid: '550e8400-e29b-41d4-a716-446655440000',
            url: 'https://web-scraping.dev/page',
          },
        });
        const sig = generateScrapflySignature(Buffer.from(body), secret);

        const res = await request(app)
          .post('/webhooks/scrapfly')
          .set('Content-Type', 'application/json')
          .set('X-Scrapfly-Webhook-Signature', sig)
          .set('X-Scrapfly-Crawl-Event-Name', event)
          .send(body);

        expect(res.status).toBe(200);
      });
    });

    it('accepts a lowercase-hex signature (X-Scrapfly-Webhook-Signature-Lowercase variant)', async () => {
      const body = JSON.stringify({ result: { status_code: 200 } });
      const sig = generateScrapflySignature(Buffer.from(body), secret).toLowerCase();

      const res = await request(app)
        .post('/webhooks/scrapfly')
        .set('Content-Type', 'application/json')
        .set('X-Scrapfly-Webhook-Signature', sig)
        .set('X-Scrapfly-Webhook-Resource-Type', 'scrape')
        .send(body);

      expect(res.status).toBe(200);
    });

    it('returns 400 when the body is not valid JSON', async () => {
      const malformed = '{ this is not json';
      const sig = generateScrapflySignature(Buffer.from(malformed), secret);

      const res = await request(app)
        .post('/webhooks/scrapfly')
        .set('Content-Type', 'application/json')
        .set('X-Scrapfly-Webhook-Signature', sig)
        .set('X-Scrapfly-Webhook-Resource-Type', 'scrape')
        .send(malformed);

      expect(res.status).toBe(400);
      expect(res.text).toBe('Invalid JSON payload');
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
