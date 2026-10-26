require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify the `Signature` header: hex(HMAC-SHA256(rawBody, profile ServerKey)).
 * The header is the bare digest (no prefix). Only the body is signed.
 */
function verifyPayTabsSignature(rawBody, header, secret) {
  if (typeof header !== 'string' || !secret) return false;
  // Buffer.from(x, 'hex') silently drops bad characters, so check the format first
  if (!/^[0-9a-f]{64}$/i.test(header)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(header, 'hex'), expected);
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// Raw body is required: the signature covers the exact bytes PayTabs sent.
// type '*/*' makes the raw parser (and so verification) work for any content type.
app.post('/webhooks/paytabs', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  const signature = req.headers['signature'];
  if (!signature) {
    return res.status(401).send('Missing signature header');
  }
  if (!verifyPayTabsSignature(rawBody, signature, process.env.PAYTABS_WEBHOOK_SECRET)) {
    console.error('PayTabs webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after verification, and treat every field as untrusted
  let transaction;
  try {
    transaction = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!isObject(transaction)) {
    return res.status(400).send('Invalid payload');
  }

  // There is no event name: every callback/IPN is the full transaction.
  // tran_type is the transaction type; payment_result.response_status is the outcome.
  const tranType = typeof transaction.tran_type === 'string' ? transaction.tran_type : undefined;
  const tranRef = typeof transaction.tran_ref === 'string' ? transaction.tran_ref : undefined;
  const result = isObject(transaction.payment_result) ? transaction.payment_result : {};
  const status = typeof result.response_status === 'string' ? result.response_status : undefined;

  if (status === 'A') {
    switch (tranType) {
      case 'Sale':
        console.log('Sale authorised:', tranRef);
        break;
      case 'Refund':
        console.log('Refund authorised:', tranRef);
        break;
      default:
        console.log('Transaction authorised:', tranType, tranRef);
    }
  } else {
    console.log('Transaction not authorised:', tranType, tranRef, status, result.response_message);
  }

  // IPN fires on every create or change, so dedupe on tran_ref plus status
  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

module.exports = { app, verifyPayTabsSignature };
