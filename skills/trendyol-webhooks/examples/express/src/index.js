// Generated with: trendyol-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the key's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Trendyol does not sign payloads. With authenticationType API_KEY, every request carries
 * the webhook's apiKey as plain text in the x-api-key header; compare the whole value.
 * (Node lowercases incoming header names, so the lookup is case-insensitive.)
 */
function verifyTrendyolRequest(headers, secret = process.env.TRENDYOL_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers['x-api-key'];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

// Each package is the full order package; its status says what changed.
function handlePackage(pkg) {
  const status = String(pkg.status || pkg.shipmentPackageStatus || '').toUpperCase();
  const ref = `${pkg.orderNumber} (package ${pkg.shipmentPackageId})`;

  switch (status) {
    case 'CREATED':
      console.log(`Package created: ${ref}`);
      // TODO: import the order and start picking
      break;

    case 'PICKING':
      console.log(`Package picking: ${ref}`);
      // TODO: mark the order as being prepared
      break;

    case 'INVOICED':
      console.log(`Package invoiced: ${ref}`);
      // TODO: record the invoice (pkg.invoiceNumber, pkg.invoiceLink)
      break;

    case 'SHIPPED':
      console.log(`Package shipped: ${ref}`);
      // TODO: store pkg.cargoTrackingNumber and pkg.cargoProviderName
      break;

    case 'DELIVERED':
      console.log(`Package delivered: ${ref}`);
      // TODO: complete the order
      break;

    case 'UNDELIVERED':
      console.log(`Package undelivered: ${ref}`);
      // TODO: follow up with the carrier
      break;

    case 'CANCELLED':
      console.log(`Package cancelled: ${ref}`);
      // TODO: release stock (pkg.lines[].cancelReason)
      break;

    case 'RETURNED':
      console.log(`Package returned: ${ref}`);
      // TODO: start the return flow
      break;

    case 'UNSUPPLIED':
      console.log(`Package unsupplied: ${ref}`);
      // TODO: reconcile stock
      break;

    case 'AWAITING':
      console.log(`Package awaiting: ${ref}`);
      break;

    case 'UNPACKED':
      console.log(`Package unpacked: ${ref}`);
      break;

    case 'AT_COLLECTION_POINT':
      console.log(`Package at collection point: ${ref}`);
      // TODO: notify the customer if you track pickup
      break;

    case 'VERIFIED':
      console.log(`Package verified: ${ref}`);
      break;

    default:
      console.log(`Unhandled package status: ${status || '(none)'} for ${ref}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/trendyol', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyTrendyolRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing x-api-key' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.content)) {
    return res.status(400).json({ error: 'Expected a JSON object with a content array' });
  }

  try {
    for (const pkg of payload.content) {
      if (pkg && typeof pkg === 'object') handlePackage(pkg);
    }
  } catch (err) {
    // A non-2xx makes Trendyol re-send every 5 minutes, so handlers should be idempotent.
    console.error('Error handling Trendyol package:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyTrendyolRequest = verifyTrendyolRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/trendyol`);
  });
}
