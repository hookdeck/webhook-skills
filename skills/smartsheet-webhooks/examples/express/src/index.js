// Generated with: smartsheet-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Smartsheet-Hmac-SHA256 = hex HMAC-SHA256 of the raw body, keyed with the
// webhook's sharedSecret. Compare case-insensitively.
function verifySmartsheetSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signatureHeader.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);
  return received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
}

function handleEvent(event) {
  switch (`${event.objectType}.${event.eventType}`) {
    case 'row.created':
      console.log('Row created:', event.id);
      // TODO: Fetch the row via the API (callbacks are "skinny") and process it
      break;
    case 'row.updated':
      console.log('Row updated:', event.id);
      break;
    case 'row.deleted':
      console.log('Row deleted:', event.id);
      break;
    case 'cell.updated':
      console.log('Cell updated: row', event.rowId, 'column', event.columnId);
      break;
    case 'sheet.updated':
      console.log('Sheet updated:', event.id);
      break;
    default:
      console.log(`Unhandled event: ${event.objectType}.${event.eventType}`);
  }
}

// express.raw({ type: '*/*' }) keeps the raw bytes whatever the Content-Type is
app.post('/webhooks/smartsheet', express.raw({ type: '*/*' }), (req, res) => {
  // 1. Verification handshake FIRST: Smartsheet sends it on enable and again
  //    about every 100 callbacks. Challenge requests may be unsigned, so echo
  //    the value before any signature check.
  const challenge = req.get('Smartsheet-Hook-Challenge');
  if (challenge) {
    res.set('Smartsheet-Hook-Response', challenge);
    return res.status(200).json({ smartsheetHookResponse: challenge });
  }

  // 2. Verify the signature over the raw body
  const signature = req.get('Smartsheet-Hmac-SHA256');
  if (!signature) {
    return res.status(400).send('Missing Smartsheet-Hmac-SHA256 header');
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySmartsheetSignature(rawBody, signature, process.env.SMARTSHEET_SHARED_SECRET)) {
    console.error('Smartsheet webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // 3. Parse and dispatch
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  if (payload.newWebhookStatus) {
    // Status change callback (webhook automatically disabled or re-enabled)
    console.log('Webhook status changed:', payload.newWebhookStatus);
  } else {
    for (const event of payload.events || []) {
      handleEvent(event);
    }
  }

  // Any 200 acknowledges the callback
  res.json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/smartsheet`);
  });
}
