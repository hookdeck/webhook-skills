// Generated with: ship24-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Ship24 does not sign payloads. Every webhook carries the account's Webhook Secret as
 * "Authorization: Bearer <secret>". The configured value is the bare secret (a pasted
 * "Bearer " prefix is stripped, as Hookdeck does). The scheme matches in any case; the
 * secret is compared exactly, in constant time.
 *
 * A static shared credential authenticates the sender, not the body, and gives no replay
 * protection (no signature, no timestamp): use HTTPS and rotate the secret if it leaks.
 */
function verifyShip24Request(headers, configured = process.env.SHIP24_WEBHOOK_SECRET) {
  if (!configured) return false; // never accept when unconfigured
  const secret = Buffer.from(configured.replace(/^bearer /i, ''), 'utf8');
  if (!secret.length) return false; // a configured value of just "Bearer " must not match
  const header = headers['authorization'];
  if (typeof header !== 'string' || header.slice(0, 7).toLowerCase() !== 'bearer ') return false;
  const received = Buffer.from(header.slice(7), 'latin1');
  // timingSafeEqual throws on unequal lengths, so check them first.
  return secret.length > 0 && received.length === secret.length &&
    crypto.timingSafeEqual(received, secret);
}

// In-memory dedupe for the example. Use a shared store (Redis, a database unique key) in production.
const processedMessageIds = new Set();

function handleTracking(tracking) {
  const { metadata, tracker } = tracking;

  switch (metadata.topic) {
    case 'tracking/events': {
      const event = (tracking.events || [])[0];
      console.log(`Tracking update for ${tracker?.trackingNumber}: ${event?.status}`);
      // TODO: compare event.occurrenceDatetime with the latest stored event before changing
      // shipment status, because messages can arrive out of order
      break;
    }

    case 'tracking/pod': {
      const { data } = tracking;
      console.log(`Proof of delivery for ${tracker?.trackingNumber}: ${data?.status}`);
      // TODO: if data.status is "found", store data.content.text or download
      // data.content.downloadUrl (valid for 7 days)
      break;
    }

    default:
      console.log(`Unhandled topic: ${metadata.topic}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/ship24', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyShip24Request(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization bearer secret' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const trackings = payload && payload.trackings;
  if (!Array.isArray(trackings) || !trackings.every((t) => t && t.metadata && typeof t.metadata === 'object')) {
    return res.status(400).json({ error: 'Expected { trackings: [...] } with metadata on each item' });
  }

  try {
    // trackings holds one item unless the account groups updates, so always loop.
    for (const tracking of trackings) {
      const { messageId } = tracking.metadata;
      if (messageId && processedMessageIds.has(messageId)) {
        console.log(`Duplicate message ${messageId}, skipping`);
        continue;
      }
      handleTracking(tracking);
      if (messageId) processedMessageIds.add(messageId);
    }
  } catch (err) {
    console.error('Error handling Ship24 message:', err);
    return res.status(500).json({ error: 'Handler error' }); // Ship24 retries non-2xx
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyShip24Request = verifyShip24Request;
module.exports.processedMessageIds = processedMessageIds;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ship24`);
  });
}
