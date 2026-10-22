// Generated with: unit-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Unit signs the ENTIRE raw body with HMAC-SHA1, keyed by the webhook token
// (a UTF-8 string), and sends the base64 digest in X-Unit-Signature.
function verifyUnitSignature(rawBody, signatureHeader, token) {
  if (!signatureHeader || !token) return false;
  const expected = crypto.createHmac('sha1', token).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// CRITICAL: read the raw body for ANY content type (application/json,
// application/vnd.api+json, ...). Parsing JSON first would break the HMAC.
app.post('/webhooks/unit', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).send('Missing request body');
  }

  const signature = req.get('x-unit-signature');
  if (!signature) {
    return res.status(400).send('Missing X-Unit-Signature header');
  }
  if (!verifyUnitSignature(rawBody, signature, process.env.UNIT_WEBHOOK_TOKEN)) {
    console.error('Unit webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // `data` is an array of events (up to 64 with AtLeastOnce delivery).
  const events = Array.isArray(payload.data) ? payload.data : [];

  for (const event of events) {
    // TODO: dedupe on event.id (Unit retries AtLeastOnce deliveries)
    switch (event.type) {
      case 'application.approved':
        console.log('Application approved:', event.relationships?.application?.data?.id);
        // TODO: Start onboarding for the new customer
        break;

      case 'application.denied':
        console.log('Application denied:', event.relationships?.application?.data?.id);
        // TODO: Notify the applicant
        break;

      case 'customer.created':
        console.log('Customer created:', event.relationships?.customer?.data?.id);
        // TODO: Sync the customer record
        break;

      case 'account.created':
        console.log('Account created:', event.relationships?.account?.data?.id);
        // TODO: Store the account id
        break;

      case 'transaction.created':
        console.log('Transaction created:', event.relationships?.transaction?.data?.id);
        // TODO: Update your ledger
        break;

      case 'payment.clearing':
        console.log('Payment clearing:', event.relationships?.payment?.data?.id);
        // TODO: Mark the payment as clearing
        break;

      case 'payment.returned':
        console.log('Payment returned:', event.relationships?.payment?.data?.id);
        // TODO: Reverse the payment and alert
        break;

      default:
        // Unit adds event types over time; ignore the ones you don't handle.
        console.log('Unhandled event type:', event.type);
    }
  }

  // Unit expects HTTP 200 (AtMostOnce deliveries are not retried otherwise).
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/unit`);
  });
}
