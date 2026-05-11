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

    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch (err) {
      console.error('Failed to parse Scrapfly webhook payload:', err.message);
      return res.status(400).send('Invalid JSON payload');
    }

    console.log(`Scrapfly webhook (id=${webhookId} resource=${resourceType} job=${jobId})`);

    // Route by resource type for the Scrape / Extraction / Screenshot APIs.
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
        console.log('Extraction result:', payload?.result?.data);
        // TODO: Save structured data, trigger downstream enrichment
        break;

      case 'screenshot':
        console.log('Screenshot result URL:', payload?.result?.screenshot_url);
        // TODO: Store image, generate thumbnail, notify user
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
