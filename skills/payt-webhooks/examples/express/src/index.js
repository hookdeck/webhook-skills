// Generated with: payt-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// x-payt-signature is the bare hex HMAC-SHA256 digest: exactly 64 hex characters, no prefix.
const SIGNATURE_FORMAT = /^[0-9a-fA-F]{64}$/;

/**
 * Verify the x-payt-signature header.
 * Signature = hex(HMAC-SHA256(secret, rawBody)): the raw body bytes only (no timestamp or id
 * is signed), key = the secret's UTF-8 bytes. The format is checked first, so Buffer.from()
 * never sees an unvalidated value; hex is case-insensitive, so both sides are lowercased.
 */
function verifyPaytSignature(rawBody, signature, secret) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false;
  if (typeof signature !== 'string' || !SIGNATURE_FORMAT.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature.toLowerCase(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// The body is { event: { event_name, context, event_time } }: dispatch on event.event_name.
function handleEvent(eventName, context) {
  const debtor = context.debtor || {};

  switch (eventName) {
    case 'invoice_created':
      console.log(`Invoice ${context.invoice_number} created for ${debtor.name} (open: ${context.amount_open} ${context.currency_code})`);
      // TODO: sync the new invoice to your system
      break;

    case 'invoice_paid':
    case 'invoice_closed':
      console.log(`Invoice ${context.invoice_number} ${eventName === 'invoice_paid' ? 'paid' : 'closed'}`);
      // TODO: mark the invoice as settled
      break;

    case 'invoice_payment_created':
      // book_amount is the amount in the administration's bookkeeping currency
      console.log(`Payment ${context.id} of ${context.amount} ${context.currency_code} on invoice ${context.invoice && context.invoice.invoice_number}`);
      // TODO: book the payment in your accounting system
      break;

    case 'case_created':
      console.log(`Debt collection case ${context.credit_case_number} created with ${(context.invoices || []).length} invoice(s)`);
      // TODO: flag the debtor's invoices as in collection
      break;

    case 'case_paid':
      console.log(`Debt collection case ${context.credit_case_number} fully paid`);
      break;

    case 'bundled_reminder_sent':
      console.log(`Bundled reminder ${context.id} sent as ${context.sent_as_format} (${(context.invoices || []).length} invoice(s))`);
      break;

    case 'payment_plan_created':
      console.log(`Payment plan ${context.id} created for ${debtor.name}`);
      break;

    case 'credit_limit_exceeded':
      console.log(`Credit limit exceeded for debtor ${context.debtor_code} (${context.book_open_amount} open of ${context.credit_limit_amount})`);
      // TODO: alert your credit controller
      break;

    case 'psp_transaction_successful':
      console.log(`PSP transaction registered on invoice ${context.invoice_number}`);
      break;

    default:
      console.log(`Unhandled Payt event: ${eventName}`);
  }
}

// Read the body raw so the exact bytes are verified, whatever Content-Type the request carries.
app.post('/webhooks/payt', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.PAYT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PAYT_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyPaytSignature(rawBody, req.get('x-payt-signature'), secret)) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  const event = body && body.event;
  if (!event || typeof event.event_name !== 'string') {
    return res.status(400).json({ error: 'Missing event.event_name' });
  }

  // Delivery is at least once and unordered (invoice_closed can arrive before invoice_created):
  // make processing idempotent. For an unknown object Payt suggests answering 404 so it retries later.
  try {
    handleEvent(event.event_name, event.context && typeof event.context === 'object' ? event.context : {});
  } catch (err) {
    console.error('Error handling Payt webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Payt needs a 200 within 10 seconds, otherwise the delivery is retried
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPaytSignature = verifyPaytSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/payt`);
  });
}
