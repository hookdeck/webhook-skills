// Generated with: doordash-drive-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * DoorDash Drive does not sign payloads. Whatever text you enter in the Developer Portal
 * ("Basic Auth") is sent verbatim as the Authorization header. Compare the WHOLE header
 * value; don't strip a scheme prefix and don't base64-decode it as HTTP Basic.
 *
 * A static credential authenticates the sender, not the body, and gives no replay
 * protection (no signature, no timestamp): use HTTPS and rotate the credential if it leaks.
 */
function verifyDoorDashDriveRequest(headers, config = process.env) {
  const expected = config.DOORDASH_DRIVE_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * Delivery webhooks carry `event_name`. Refund webhooks have no event_name and nest
 * their data under `event_data`.
 */
function classify(payload) {
  if (typeof payload.event_name === 'string') return payload.event_name;
  if (payload.event_data && typeof payload.event_data === 'object') return 'refund';
  return null;
}

function handleEvent(payload) {
  const name = classify(payload);

  switch (name) {
    case 'DASHER_CONFIRMED':
      console.log(`Dasher ${payload.dasher_id} confirmed delivery ${payload.external_delivery_id}`);
      // TODO: show the Dasher's name and vehicle to the customer
      break;

    case 'DASHER_CONFIRMED_PICKUP_ARRIVAL':
      console.log(`Dasher arrived at pickup for ${payload.external_delivery_id}`);
      break;

    case 'DASHER_PICKED_UP':
      console.log(`Delivery ${payload.external_delivery_id} picked up at ${payload.pickup_time_actual}`);
      // TODO: mark the order as out for delivery
      break;

    case 'DASHER_CONFIRMED_DROPOFF_ARRIVAL':
      console.log(`Dasher arrived at dropoff for ${payload.external_delivery_id}`);
      break;

    case 'DASHER_DROPPED_OFF':
      console.log(`Delivery ${payload.external_delivery_id} dropped off at ${payload.dropoff_time_actual}`);
      // TODO: mark the order as delivered
      break;

    case 'DELIVERY_CANCELLED':
      console.log(`Delivery ${payload.external_delivery_id} cancelled: ${payload.cancellation_reason}`);
      // TODO: cancel or re-dispatch the order
      break;

    case 'DELIVERY_RETURN_INITIALIZED':
    case 'DASHER_CONFIRMED_RETURN_ARRIVAL':
    case 'DELIVERY_RETURNED':
      console.log(`Return update ${name} for ${payload.external_delivery_id}`);
      break;

    case 'DELIVERY_BATCHED':
      console.log(`Delivery ${payload.external_delivery_id} batched (${payload.force_batch_id})`);
      break;

    case 'refund':
      console.log(`Refund: ${payload.event_data.reason} (${payload.event_data.amount} ${payload.event_data.currency_code})`);
      // TODO: record the refund
      break;

    default:
      if (typeof name === 'string' && name.startsWith('dasher_enroute_to_')) {
        console.log(`${name} for ${payload.external_delivery_id}:`, payload.dasher_location);
        // TODO: update the live map
      } else {
        console.log('Unhandled DoorDash Drive payload', name);
      }
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type DoorDash uses.
app.post('/webhooks/doordash-drive', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyDoorDashDriveRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling DoorDash Drive webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // DoorDash retries anything other than 200 OK (3 attempts in total).
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyDoorDashDriveRequest = verifyDoorDashDriveRequest;
module.exports.classify = classify;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/doordash-drive`);
  });
}
