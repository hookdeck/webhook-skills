// Generated with: column-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Column signs every delivery with a Column-Signature header: the bare lowercase hex
// HMAC-SHA256 of the raw request body, keyed with the endpoint's signing secret.
// Nothing else is signed (no timestamp or id), so there is no replay window to check.
// https://docs.column.com/markdown/working-with-the-api/events-and-webhooks
function verifyColumn(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;

  // The whole header is one 64-char hex digest. Check the format first: Buffer.from(x, 'hex')
  // silently drops invalid characters, so never decode an unvalidated value.
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex'); // safe: validated above
  return crypto.timingSafeEqual(received, expected);
}

// Raw body is required: the signature covers the exact bytes Column sent.
// type: '*/*' reads the body whatever the Content-Type is, so verification never depends on it.
app.post('/webhooks/column', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.COLUMN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('COLUMN_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyColumn(rawBody, req.headers['column-signature'], secret)) {
    console.error('Column webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  // Delivery is at-least-once: redeliveries keep the same event id (evnt_...), so dedupe on it.
  // Ordering is not guaranteed.
  switch (event.type) {
    case 'ach.outgoing_transfer.completed':
      console.log(`ACH transfer completed: ${event.data?.id} [${event.id}]`);
      break;
    case 'ach.outgoing_transfer.returned':
      console.log(`ACH transfer returned: ${event.data?.id} [${event.id}]`);
      break;
    case 'book.transfer.completed':
      console.log(`Book transfer completed: ${event.data?.id} [${event.id}]`);
      break;
    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Column webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyColumn };
