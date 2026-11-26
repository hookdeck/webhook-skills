// Generated with: certn-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// CertnCentric webhooks: https://centric-api-docs.certn.co/#webhooks
// - Endpoint verification: Certn sends GET ?challenge=<value> when you add the URL, and again
//   periodically. Echo the value as the body within 10 seconds, or Certn disables the webhook.
// - Signature: X-Signature is the hex HMAC-SHA256 of the raw request body, keyed with the
//   signing key Certn gives you when you create the webhook. No timestamp, no prefix.

function verifyCertn(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;
  // Exactly 64 hex chars first, then compare equal-length lowercase hex strings in constant time
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected));
}

// Endpoint verification (challenge-response). Not signed: don't run the signature check here.
app.get('/webhooks/certn', (req, res) => {
  const { challenge } = req.query;
  if (typeof challenge !== 'string') {
    return res.status(400).send('Missing challenge');
  }
  res
    .status(200)
    .set({ 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' })
    .send(challenge);
});

// Events. Raw body is required: the signature covers the exact bytes Certn sent.
// type: '*/*' reads the body whatever the Content-Type is, so verification never depends on it.
app.post('/webhooks/certn', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.CERTN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CERTN_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyCertn(rawBody, req.get('X-Signature'), secret)) {
    console.error('Certn webhook signature verification failed');
    return res.status(403).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Deduplicate on event.event_id before doing work: retries can deliver an event again,
  // and out of order. Return 200 within 10 seconds and do slow work in a background job.
  switch (event.event_type) {
    case 'CASE_STATUS_CHANGED':
      console.log(`Case ${event.object_id} status: ${event.case_status}`);
      break;
    case 'CHECK_STATUS_CHANGED': {
      const check = event.triggered_check || {};
      console.log(`Case ${event.object_id} check ${check.type} status: ${check.status}`);
      if (check.action_required_resolution) {
        // Follow steps[] in ascending `step` order with Certn's API to resolve the check
        console.log(`Client action required: ${check.action_required_resolution.summary}`);
      }
      break;
    }
    case 'CASE_REPORT_READY':
      console.log(`Case ${event.object_id} report ready`);
      break;
    case 'CASE_INPUT_CLAIMS_AUTOMATICALLY_GENERATED':
      console.log(`Case ${event.object_id} has new input claims`);
      break;
    default:
      console.log(`Unhandled event type: ${event.event_type}`);
  }

  res.status(200).json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Certn webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyCertn };
