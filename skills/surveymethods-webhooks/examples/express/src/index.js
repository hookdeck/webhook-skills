// Generated with: surveymethods-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a SurveyMethods webhook signature.
 *
 * SurveyMethods sends `X-SurveyMethods-Signature: sha256=<hex>` where <hex> is the HMAC-SHA256
 * of the raw request body keyed with the webhook's signing secret. The bare digest is accepted too.
 */
function verifySurveyMethodsSignature(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || !secret) return false;
  let received = signatureHeader.trim();
  if (received.startsWith('sha256=')) received = received.slice('sha256='.length);
  // Check hex shape first: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}

// Read the raw body for ANY content type so the exact bytes are verified before parsing.
app.post('/webhooks/surveymethods', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.SURVEYMETHODS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SURVEYMETHODS_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.headers['x-surveymethods-signature'];

  if (!verifySurveyMethodsSignature(rawBody, signature, secret)) {
    console.error('SurveyMethods webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (typeof event !== 'object' || event === null || Array.isArray(event)) {
    return res.status(400).send('Invalid event');
  }

  // Delivery is at-least-once (up to 5 attempts): deduplicate on event.eventId
  switch (event.eventType) {
    case 'response.completed':
      console.log(`Response completed on survey ${event.data?.surveyId} (event ${event.eventId})`);
      break;
    case 'response.created':
      console.log(`Response started on survey ${event.data?.surveyId} (event ${event.eventId})`);
      break;
    case 'survey.created':
      console.log(`Survey created: ${event.data?.surveyId} (event ${event.eventId})`);
      break;
    case 'collector.created':
      console.log(`Collector created: ${event.data?.collectorId} (event ${event.eventId})`);
      break;
    default:
      console.log(`Unhandled SurveyMethods event: ${event.eventType}`);
  }

  res.json({ received: true });
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`SurveyMethods webhook server listening on port ${port}`));
}

module.exports = { app, verifySurveyMethodsSignature };
