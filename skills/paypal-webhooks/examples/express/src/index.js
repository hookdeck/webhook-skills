// Generated with: paypal-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const zlib = require('zlib');
const https = require('https');

const app = express();

// Cert cache — keyed by paypal-cert-url. PayPal rotates by changing the URL,
// so a cache miss == new cert == fetch once. Exported for tests to preload.
const certCache = new Map();

function fetchCert(certUrl) {
  // SECURITY: Only trust certificates served from paypal.com hosts.
  // Both sandbox (api.sandbox.paypal.com) and live (api.paypal.com) end in .paypal.com.
  const host = new URL(certUrl).hostname;
  if (host !== 'paypal.com' && !host.endsWith('.paypal.com')) {
    return Promise.reject(new Error(`Untrusted cert URL host: ${host}`));
  }
  if (certCache.has(certUrl)) {
    return Promise.resolve(certCache.get(certUrl));
  }
  return new Promise((resolve, reject) => {
    https
      .get(certUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          certCache.set(certUrl, data);
          resolve(data);
        });
      })
      .on('error', reject);
  });
}

async function verifyPayPalWebhook(headers, rawBody, webhookId) {
  const transmissionId = headers['paypal-transmission-id'];
  const transmissionTime = headers['paypal-transmission-time'];
  const transmissionSig = headers['paypal-transmission-sig'];
  const certUrl = headers['paypal-cert-url'];

  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl) {
    return false;
  }

  // CRC-32 of the raw body as an unsigned decimal integer.
  const crc = zlib.crc32(rawBody);
  const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crc}`;

  let cert;
  try {
    cert = await fetchCert(certUrl);
  } catch {
    return false;
  }

  const verifier = crypto.createVerify('SHA256');
  verifier.update(message);
  verifier.end();
  try {
    return verifier.verify(cert, transmissionSig, 'base64');
  } catch {
    return false;
  }
}

// CRITICAL: express.raw() — PayPal verification needs the exact raw bytes
// because the CRC-32 of the body is part of the signed message.
app.post(
  '/webhooks/paypal',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) {
      console.error('PAYPAL_WEBHOOK_ID is not set');
      return res.status(500).send('Server misconfigured');
    }

    const valid = await verifyPayPalWebhook(req.headers, req.body, webhookId);
    if (!valid) {
      return res.status(400).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        console.log('Capture completed:', event.resource?.id);
        // TODO: fulfill order, send receipt
        break;
      case 'PAYMENT.CAPTURE.REFUNDED':
        console.log('Capture refunded:', event.resource?.id);
        // TODO: reverse fulfillment
        break;
      case 'PAYMENT.SALE.COMPLETED':
        console.log('Sale completed:', event.resource?.id);
        break;
      case 'CHECKOUT.ORDER.APPROVED':
        console.log('Order approved:', event.resource?.id);
        // TODO: capture payment server-side
        break;
      case 'BILLING.SUBSCRIPTION.CREATED':
        console.log('Subscription created:', event.resource?.id);
        break;
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        console.log('Subscription activated:', event.resource?.id);
        // TODO: provision access
        break;
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        console.log('Subscription cancelled:', event.resource?.id);
        // TODO: revoke access at period end
        break;
      case 'CUSTOMER.DISPUTE.CREATED':
        console.log('Dispute opened:', event.resource?.dispute_id);
        // TODO: alert ops
        break;
      default:
        console.log(`Unhandled event type: ${event.event_type}`);
    }

    res.json({ received: true });
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, certCache, verifyPayPalWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/paypal`);
  });
}
