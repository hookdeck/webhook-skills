// Generated with: cal-com-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Cal.com webhook signature.
 *
 * Cal.com sends `x-cal-signature-256` = lowercase hex HMAC-SHA256 of the raw
 * body, keyed on the webhook's secret. Webhooks without a secret send the
 * literal "no-secret-provided", which fails this check.
 *
 * @param {Buffer|string} rawBody - Raw request body (do NOT re-stringify parsed JSON)
 * @param {string|undefined} signatureHeader - `x-cal-signature-256` header value
 * @param {string|undefined} secret - Webhook secret configured in Cal.com
 * @returns {boolean} Whether the signature is valid
 */
function verifyCalComWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // length mismatch = invalid
  }
}

// Cal.com webhook endpoint. Accept any content type as raw bytes: custom
// payload templates that aren't JSON are sent as x-www-form-urlencoded.
app.post(
  '/webhooks/cal-com',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.CALCOM_WEBHOOK_SECRET;
    if (!secret) {
      console.error('CALCOM_WEBHOOK_SECRET is not set');
      return res.status(500).send('Webhook secret not configured');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const signature = req.get('x-cal-signature-256');

    if (!signature) {
      return res.status(400).send('Missing signature header');
    }
    if (!verifyCalComWebhook(rawBody, signature, secret)) {
      console.error('Cal.com webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after verification
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // MEETING_STARTED / MEETING_ENDED use a flat payload (no `payload` wrapper)
    const data = event.payload ?? event;
    const version = req.get('x-cal-webhook-version');
    console.log(`Received ${event.triggerEvent} (version ${version})`);

    switch (event.triggerEvent) {
      case 'BOOKING_CREATED':
        console.log(`Booking created: ${data.uid} "${data.title}" at ${data.startTime}`);
        // TODO: Create CRM record, send custom confirmation, etc.
        break;

      case 'BOOKING_REQUESTED':
        console.log(`Booking requested (awaiting confirmation): ${data.uid}`);
        break;

      case 'BOOKING_RESCHEDULED':
        console.log(`Booking rescheduled: ${data.rescheduleUid} -> ${data.uid} at ${data.startTime}`);
        // TODO: Update calendar / CRM with the new time
        break;

      case 'BOOKING_CANCELLED':
        console.log(`Booking cancelled: ${data.uid} (${data.cancellationReason || 'no reason'})`);
        // TODO: Release resources, issue refunds, etc.
        break;

      case 'BOOKING_REJECTED':
        console.log(`Booking rejected: ${data.uid} (${data.rejectionReason || 'no reason'})`);
        break;

      case 'BOOKING_PAID':
        console.log(`Booking paid: ${data.uid} (payment ${data.paymentId})`);
        // TODO: Mark order as paid
        break;

      case 'MEETING_STARTED':
        console.log(`Meeting started: ${data.uid}`);
        break;

      case 'MEETING_ENDED':
        console.log(`Meeting ended: ${data.uid}`);
        // TODO: Send follow-up email, survey, invoice
        break;

      case 'RECORDING_READY':
        console.log(`Recording ready for: ${data.title}`);
        break;

      case 'FORM_SUBMITTED':
        console.log(`Routing form submitted: ${data.formName} (${data.formId})`);
        break;

      default:
        console.log(`Unhandled event: ${event.triggerEvent}`);
    }

    // Acknowledge quickly; do slow work asynchronously
    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyCalComWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/cal-com`);
  });
}
