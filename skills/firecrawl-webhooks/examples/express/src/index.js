// Generated with: firecrawl-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Verify X-Firecrawl-Signature: "sha256=<hex>", an HMAC-SHA256 of the raw body.
 */
function verifyFirecrawlWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const idx = signatureHeader.indexOf('=');
  const algo = signatureHeader.slice(0, idx);
  const sig = signatureHeader.slice(idx + 1);
  if (idx < 0 || algo !== 'sha256' || !sig) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    // Different lengths = invalid
    return false;
  }
}

// Raw body for ANY content type: the signature covers the exact bytes sent
app.post('/webhooks/firecrawl', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('X-Firecrawl-Signature');

  if (!signature) {
    return res.status(400).send('Missing X-Firecrawl-Signature header');
  }

  if (!Buffer.isBuffer(req.body) || !verifyFirecrawlWebhook(req.body, signature, process.env.FIRECRAWL_WEBHOOK_SECRET)) {
    console.error('Firecrawl signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse only after verification
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  switch (event.type) {
    case 'crawl.started':
      console.log(`Crawl ${event.id} started`);
      break;
    case 'crawl.page':
      console.log(`Crawl ${event.id} scraped ${event.data?.[0]?.metadata?.url}`);
      // TODO: store event.data[0].markdown, dedupe on event.webhookId
      break;
    case 'crawl.completed':
      console.log(`Crawl ${event.id} completed`);
      break;
    case 'batch_scrape.started':
      console.log(`Batch scrape ${event.id} started`);
      break;
    case 'batch_scrape.page':
      console.log(`Batch scrape ${event.id} scraped ${event.data?.[0]?.metadata?.url}`);
      break;
    case 'batch_scrape.completed':
      console.log(`Batch scrape ${event.id} completed`);
      break;
    case 'extract.started':
      console.log(`Extract ${event.id} started`);
      break;
    case 'extract.completed':
      console.log(`Extract ${event.id} completed:`, event.data?.[0]?.data);
      break;
    case 'extract.failed':
      console.error(`Extract ${event.id} failed: ${event.error}`);
      break;
    case 'agent.started':
    case 'agent.action':
    case 'agent.completed':
    case 'agent.failed':
    case 'agent.cancelled':
      console.log(`Agent ${event.id}: ${event.type}`);
      break;
    case 'monitor.page':
    case 'monitor.check.completed':
      console.log(`Monitor ${event.id}: ${event.type}`);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Acknowledge fast (Firecrawl times out after 10s)
  res.status(200).json({ received: true });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Firecrawl webhook server listening on port ${PORT}`);
  });
}

module.exports = { app, verifyFirecrawlWebhook };
