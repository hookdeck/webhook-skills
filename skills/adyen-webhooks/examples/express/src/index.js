// Generated with: adyen-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const { hmacValidator } = require('@adyen/api-library');

const app = express();

// Adyen's official HMAC validator. It builds the ':'-delimited signing string
// from the NotificationRequestItem fields, hex-decodes the key, computes
// HMAC-SHA256/base64, and timing-safe compares against additionalData.hmacSignature.
const validator = new hmacValidator();

const HMAC_KEY = process.env.ADYEN_HMAC_KEY;

/**
 * Optional Basic Auth check. Adyen can send Basic Auth credentials alongside
 * HMAC. Only enforced when both env vars are configured.
 * @returns {boolean} true if auth passes (or is not configured)
 */
function checkBasicAuth(authHeader) {
  const user = process.env.ADYEN_WEBHOOK_USERNAME;
  const pass = process.env.ADYEN_WEBHOOK_PASSWORD;
  if (!user || !pass) return true; // Basic Auth not configured

  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  return decoded.slice(0, sep) === user && decoded.slice(sep + 1) === pass;
}

/**
 * Handle a single verified NotificationRequestItem.
 * `success` is a string ("true"/"false") and reflects the business outcome.
 */
function handleNotification(item) {
  const { eventCode, success, pspReference, merchantReference } = item;
  const ok = success === 'true';

  switch (eventCode) {
    case 'AUTHORISATION':
      // A successful AUTHORISATION means the payment was authorised.
      // success === 'false' means it was REFUSED.
      console.log(`AUTHORISATION ${ok ? 'succeeded' : 'refused'} for ${merchantReference} (${pspReference})`);
      // TODO: fulfil the order on success, notify the shopper on refusal.
      break;

    case 'CAPTURE':
      console.log(`CAPTURE ${ok ? 'succeeded' : 'failed'} for ${pspReference}`);
      // TODO: mark funds settled.
      break;

    case 'CAPTURE_FAILED':
      console.log(`CAPTURE_FAILED for ${pspReference}`);
      // TODO: retry capture or alert operations.
      break;

    case 'REFUND':
      console.log(`REFUND ${ok ? 'succeeded' : 'failed'} for ${pspReference}`);
      // TODO: update refund status.
      break;

    case 'REFUND_FAILED':
      console.log(`REFUND_FAILED for ${pspReference}`);
      // TODO: alert support, retry refund.
      break;

    case 'CANCELLATION':
      console.log(`CANCELLATION ${ok ? 'succeeded' : 'failed'} for ${pspReference}`);
      // TODO: release held inventory.
      break;

    case 'CANCEL_OR_REFUND':
      console.log(`CANCEL_OR_REFUND ${ok ? 'succeeded' : 'failed'} for ${pspReference}`);
      // TODO: reverse fulfilment.
      break;

    case 'CHARGEBACK':
      console.log(`CHARGEBACK for ${pspReference}`);
      // TODO: revoke access, update accounting.
      break;

    case 'NOTIFICATION_OF_CHARGEBACK':
      console.log(`NOTIFICATION_OF_CHARGEBACK for ${pspReference}`);
      // TODO: gather evidence to defend the dispute.
      break;

    case 'REPORT_AVAILABLE':
      console.log(`REPORT_AVAILABLE: ${item.reason || ''}`);
      // TODO: download the report.
      break;

    default:
      console.log(`Unhandled eventCode: ${eventCode} (${pspReference})`);
  }
}

// Adyen posts JSON. The HMAC is over reconstructed fields (not the raw body),
// so parsing JSON before verifying is correct for Adyen.
app.post('/webhooks/adyen', express.json(), (req, res) => {
  // 1. Optional Basic Auth
  if (!checkBasicAuth(req.headers['authorization'])) {
    return res.status(401).send('Unauthorized');
  }

  const items = req.body && req.body.notificationItems;
  if (!Array.isArray(items)) {
    return res.status(400).send('Invalid notification');
  }

  // 2. Verify the HMAC signature on every item before processing any of them.
  for (const entry of items) {
    const item = entry && entry.NotificationRequestItem;
    // validateHMAC throws if the item has no additionalData/hmacSignature —
    // treat any failure as an invalid signature.
    let valid = false;
    try {
      valid = Boolean(item) && validator.validateHMAC(item, HMAC_KEY);
    } catch {
      valid = false;
    }
    if (!valid) {
      console.error('HMAC signature verification failed');
      return res.status(401).send('Invalid HMAC signature');
    }
  }

  // 3. All items verified — process them.
  for (const entry of items) {
    handleNotification(entry.NotificationRequestItem);
  }

  // 4. Acknowledge with the literal body Adyen expects.
  res.status(200).send('[accepted]');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, validator, checkBasicAuth, handleNotification };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/adyen`);
  });
}
