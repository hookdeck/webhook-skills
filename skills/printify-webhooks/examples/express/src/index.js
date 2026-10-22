// Generated with: printify-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Verify the X-Pfy-Signature header.
 * Format: "sha256=<hex HMAC-SHA256 of the raw body>", keyed with the webhook
 * secret as a UTF-8 string (not base64-decoded).
 */
function verifyPrintifySignature(rawBody, header, secret) {
  if (typeof header !== 'string' || !header.startsWith('sha256=')) {
    return { valid: false, error: 'Malformed X-Pfy-Signature header' };
  }
  const received = header.slice('sha256='.length).trim();

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    const ok = crypto.timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
    return ok ? { valid: true } : { valid: false, error: 'Invalid signature' };
  } catch {
    return { valid: false, error: 'Invalid signature' }; // Different lengths = invalid
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Printify webhook endpoint
// IMPORTANT: express.raw({ type: '*/*' }) keeps the exact bytes Printify signed,
// whatever Content-Type the request carries.
app.post('/webhooks/printify',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.PRINTIFY_WEBHOOK_SECRET;
    if (!secret) {
      console.error('PRINTIFY_WEBHOOK_SECRET is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const signatureHeader = req.headers['x-pfy-signature'];
    if (!signatureHeader) {
      return res.status(400).json({ error: 'Missing X-Pfy-Signature header' });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const result = verifyPrintifySignature(rawBody, signatureHeader, secret);
    if (!result.valid) {
      console.error('Printify signature verification failed:', result.error);
      return res.status(400).json({ error: result.error });
    }

    // Parse only after verification
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    // Envelope: { id, type, created_at, resource: { id, type, data } }
    // Dedupe on event.id (see webhook-handler-patterns); Printify retries 4xx/5xx up to 3 times.
    const { id, type, resource } = event;
    const data = resource?.data ?? {};
    console.log(`Received Printify webhook: ${type} (${id})`);

    switch (type) {
      case 'order:created':
        console.log('Order created:', resource?.id);
        // TODO: no data is sent; fetch the order via the API
        break;
      case 'order:updated':
        console.log('Order updated:', resource?.id, data.status);
        // TODO: sync production status
        break;
      case 'order:line-item:canceled':
        console.log('Line item canceled:', resource?.id, data.line_item_id, data.status_details);
        // TODO: notify the customer / restock
        break;
      case 'order:sent-to-production':
        console.log('Order sent to production:', resource?.id);
        // TODO: mark the order as in production
        break;
      case 'order:shipment:created':
        console.log('Shipment created:', resource?.id, data.carrier?.tracking_number);
        // TODO: email tracking details
        break;
      case 'order:shipment:delivered':
        console.log('Shipment delivered:', resource?.id, data.delivered_at);
        // TODO: mark delivered
        break;
      case 'product:created':
      case 'product:updated':
        console.log(`Product ${type.split(':')[1]}:`, resource?.id);
        // TODO: sync the product
        break;
      case 'product:publish:started':
        console.log('Product publish started:', resource?.id, data.action);
        // TODO: publish to your storefront, then confirm via the API
        break;
      case 'product:deleted':
        console.log('Product deleted:', resource?.id);
        // TODO: remove the product from your catalog
        break;
      case 'shop:disconnected':
        console.log('Shop disconnected:', resource?.id);
        // TODO: stop syncing this shop
        break;
      case 'personalization-preview-task:processed':
        console.log('Personalization preview processed:', data.task_id, data.status);
        // TODO: fetch mockups on completed, retry on failed
        break;
      default:
        console.log('Unhandled Printify event:', type);
    }

    return res.status(200).json({ received: true, type });
  }
);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Printify webhook server running on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/printify`);
  });
}

module.exports = { app, verifyPrintifySignature };
