// Generated with: autotask-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an Autotask webhook signature.
 *
 * Autotask sends `X-Hook-Signature: sha1=<base64>` where the value is
 * base64(HMAC_SHA1(secretKey, rawBody)). Keep the base64 `=` padding.
 *
 * @param {Buffer} rawBody - Raw request body (Buffer from express.raw)
 * @param {string} header - X-Hook-Signature header value
 * @param {string} secret - The SecretKey set when the webhook was created
 * @returns {boolean} - Whether the signature is valid
 */
function verifyAutotaskWebhook(rawBody, header, secret) {
  if (typeof header !== 'string' || !header.startsWith('sha1=')) return false;
  const received = header.slice('sha1='.length);
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('base64');

  // Compare the base64 strings as equal-length buffers (no lenient base64 decode)
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Autotask webhook endpoint - must use raw body for signature verification
app.post('/webhooks/autotask',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.AUTOTASK_WEBHOOK_SECRET;
    if (!secret) {
      console.error('AUTOTASK_WEBHOOK_SECRET is not set');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['x-hook-signature'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    // Verify before trusting anything in the payload
    if (!signature || !verifyAutotaskWebhook(rawBody, signature, secret)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Payload: { Action, Guid, EntityType, Id, Fields, EventTime, SequenceNumber, PersonID }
    const { Action: action, EntityType: entityType, Id: id, Fields: fields } = payload;
    console.log(`Received Autotask webhook: ${entityType} ${action}`);

    switch (entityType) {
      case 'Company':
        if (action === 'Create') console.log('Company created:', id, fields);
        else if (action === 'Update') console.log('Company updated:', id, fields);
        else if (action === 'Delete') console.log('Company deleted:', id);
        // TODO: Sync companies to CRM, billing, etc.
        break;

      case 'Contact':
        if (action === 'Create') console.log('Contact created:', id, fields);
        else if (action === 'Update') console.log('Contact updated:', id, fields);
        else if (action === 'Delete') console.log('Contact deleted:', id);
        // TODO: Sync contacts to marketing or CRM tools
        break;

      case 'Ticket':
        if (action === 'Create') console.log('Ticket created:', id, fields);
        else if (action === 'Update') console.log('Ticket updated:', id, fields);
        else if (action === 'Delete') console.log('Ticket deleted:', id);
        // TODO: Alert on-call, mirror to chat, etc.
        break;

      case 'TicketNote':
        if (action === 'Create') console.log('Ticket note created:', id, fields);
        else if (action === 'Update') console.log('Ticket note updated:', id, fields);
        else if (action === 'Delete') console.log('Ticket note deleted:', id);
        // TODO: Notify watchers, sync notes, etc.
        break;

      default:
        // Other entities, or Deactivated callouts (webhook disabled or deleted)
        console.log(`Unhandled Autotask webhook: ${entityType} ${action}`);
    }

    // Return 200 to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyAutotaskWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/autotask`);
  });
}
