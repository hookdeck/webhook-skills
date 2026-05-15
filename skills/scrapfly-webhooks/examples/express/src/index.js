// Generated with: scrapfly-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Scrapfly webhook signature.
 *
 * Algorithm: upper(hex(HMAC_SHA256(secret, rawBody)))
 * Header:    X-Scrapfly-Webhook-Signature (uppercase hex)
 *
 * @param {Buffer} rawBody - Raw request body bytes
 * @param {string} signatureHeader - Value of X-Scrapfly-Webhook-Signature
 * @param {string} secret - Webhook signing secret from the Scrapfly dashboard
 * @returns {boolean}
 */
function verifyScrapflySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
    .toUpperCase();

  // Scrapfly also sends an X-Scrapfly-Webhook-Signature-Lowercase variant;
  // normalise to uppercase before comparing so either header works.
  const received = signatureHeader.toUpperCase();

  try {
    return crypto.timingSafeEqual(
      Buffer.from(received, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

// CRITICAL: Use express.raw() — Scrapfly signs the raw body bytes.
// Parsing JSON before verifying mutates the bytes and breaks the signature.
app.post('/webhooks/scrapfly',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-scrapfly-webhook-signature'];
    const resourceType = req.headers['x-scrapfly-webhook-resource-type'];
    const webhookId = req.headers['x-scrapfly-webhook-id'];
    const jobId = req.headers['x-scrapfly-webhook-job-id'];
    const crawlEvent = req.headers['x-scrapfly-crawl-event-name'];

    if (!verifyScrapflySignature(req.body, signature, process.env.SCRAPFLY_WEBHOOK_SECRET)) {
      console.error('Scrapfly webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    console.log(`Scrapfly webhook (id=${webhookId} resource=${resourceType} job=${jobId})`);

    // Dispatch BEFORE JSON parsing — screenshot deliveries are raw image
    // bytes (JPEG / PNG / WebP / GIF) regardless of the Content-Type you
    // configured in the Scrapfly dashboard (json or msgpack — both apply
    // verbatim to scrape/extraction deliveries, but screenshot bodies are
    // binary either way). Trying to JSON.parse a binary body throws after
    // verification has already succeeded.
    if (resourceType === 'screenshot') {
      console.log(`Screenshot received: ${req.body.length} bytes (binary, ${jobId})`);
      // req.body is a Buffer of the rendered image. Persist it to storage
      // (S3, disk, ImgIX, etc.) keyed on jobId / webhookId. Do not call
      // JSON.parse here. The synchronous Screenshot API response exposes
      // metadata in headers like X-Scrapfly-Screenshot-Url, but the
      // webhook delivery only carries the image bytes — fetch the metadata
      // from the synchronous response or the Scrapfly dashboard if needed.
      return res.status(200).send('OK');
    }

    // Remaining resource types are serialised per your dashboard's
    // Content-Type setting. This handler assumes `application/json`; if
    // you configured `application/msgpack`, swap JSON.parse for a msgpack
    // decoder (e.g. `@msgpack/msgpack`).

    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch (err) {
      console.error('Failed to parse Scrapfly webhook payload:', err.message);
      return res.status(400).send('Invalid JSON payload');
    }

    // Route by resource type for the Scrape / Extraction APIs.
    switch (resourceType) {
      case 'scrape':
        // Scrape API places the fetched URL at result.url (see scrapfly.io/docs/scrape-api/getting-started).
        // The webhook overlay's payload.context only carries `webhook` and `job` sub-objects.
        console.log('Scrape result:', {
          url: payload?.result?.url,
          status: payload?.result?.status_code,
        });
        // TODO: Persist HTML / extracted fields, enqueue parsing, ...
        break;

      case 'extraction':
        // Extraction body shape (from a real capture):
        // { content_type, data: { ... }, context: { webhook, job } }
        // The extracted fields live at payload.data, NOT payload.result.data.
        console.log('Extraction result:', {
          content_type: payload?.content_type,
          data: payload?.data,
        });
        // TODO: Save structured data, trigger downstream enrichment
        break;

      default: {
        // Crawler API uses lifecycle events in the body and an
        // X-Scrapfly-Crawl-Event-Name header.
        const event = crawlEvent || payload?.event;
        switch (event) {
          case 'crawler_started':
            console.log('Crawler started:', payload?.payload?.crawler_uuid);
            break;
          case 'crawler_url_visited':
            console.log('Crawler visited:', payload?.payload?.url);
            break;
          case 'crawler_url_discovered':
            console.log('Crawler discovered:', payload?.payload?.url);
            break;
          case 'crawler_url_skipped':
            console.log('Crawler skipped:', payload?.payload?.url);
            break;
          case 'crawler_url_failed':
            console.log('Crawler failed:', payload?.payload?.url);
            break;
          case 'crawler_stopped':
            console.log('Crawler stopped:', payload?.payload?.crawler_uuid);
            break;
          case 'crawler_cancelled':
            console.log('Crawler cancelled:', payload?.payload?.crawler_uuid);
            break;
          case 'crawler_finished':
            console.log('Crawler finished:', payload?.payload?.crawler_uuid);
            break;
          default:
            console.log('Unhandled Scrapfly webhook:', { resourceType, event });
        }
      }
    }

    // Return 200 quickly — do heavy work asynchronously.
    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyScrapflySignature };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/scrapfly`);
  });
}
