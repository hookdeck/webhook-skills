require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Motive webhook signature.
 *
 * Motive sends X-KT-Webhook-Signature = hex(HMAC-SHA1(sharedSecret, rawBody)).
 * The secret is used as a plain string. No timestamp, no prefix.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signature - X-KT-Webhook-Signature header value
 * @param {string|undefined} secret - The webhook's shared secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyMotiveSignature(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Handle a Motive event, dispatching on its `action`.
 */
function handleMotiveEvent(event) {
  switch (event.action) {
    case 'vehicle_location_updated':
      console.log(`Vehicle ${event.vehicle_number} at ${event.lat},${event.lon}`);
      // TODO: Update live map / ETA
      break;

    case 'vehicle_location_received':
      console.log(`Location received for vehicle ${event.vehicle_id}`);
      // TODO: Append to location history
      break;

    case 'vehicle_upserted':
      console.log(`Vehicle ${event.id} ${event.trigger || 'upserted'}`);
      // TODO: Sync the vehicle roster
      break;

    case 'fault_code_opened':
      console.log(`Fault ${event.code_label} opened on vehicle ${event.vehicle?.number}`);
      // TODO: Create a maintenance ticket
      break;

    case 'fault_code_closed':
      console.log(`Fault ${event.code_label} closed on vehicle ${event.vehicle?.number}`);
      // TODO: Close the maintenance ticket
      break;

    case 'user_upserted':
      console.log(`User ${event.id} (${event.role}) ${event.trigger}`);
      // TODO: Sync drivers and admins
      break;

    case 'inspection_report_upserted':
      console.log(`Inspection report ${event.id} upserted`);
      // TODO: Route defects to maintenance
      break;

    case 'hos_violation_upserted':
      console.log(`HOS violation ${event.id} upserted`);
      // TODO: Alert dispatch / compliance
      break;

    case 'vehicle_geofence_event':
    case 'asset_geofence_event':
      console.log(`Geofence event: ${event.action}`);
      // TODO: Track arrivals and departures
      break;

    case 'engine_toggle_event':
      console.log('Engine toggle event');
      // TODO: Update usage and idling reports
      break;

    case 'speeding_event_created':
    case 'speeding_event_updated':
    case 'driver_performance_event_created':
    case 'driver_performance_event_updated':
      console.log(`Safety event: ${event.action} (${event.id})`);
      // TODO: Queue driver coaching
      break;

    case 'user_duty_status_updated':
      console.log('Driver duty status updated');
      // TODO: Sync timecards
      break;

    case 'form_entry_upserted':
      console.log(`Form entry ${event.id} upserted`);
      // TODO: Update dispatch workflow
      break;

    case 'vehicle_gateway_disconnected':
    case 'vehicle_gateway_disconnect_ended':
    case 'dashcam_disconnected':
      console.log(`Device event: ${event.action} (${event.id})`);
      // TODO: Alert on device health
      break;

    default:
      console.log(`Unhandled Motive action: ${event.action}`);
  }
}

// Motive webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/motive',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.MOTIVE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('MOTIVE_WEBHOOK_SECRET is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    // Motive documents 403 for a signature it could not verify (no retry)
    const signature = req.headers['x-kt-webhook-signature'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifyMotiveSignature(rawBody, signature, secret)) {
      console.error('Motive webhook signature verification failed');
      return res.status(403).send('Invalid signature');
    }

    // Parse only after verification
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      // The activation test request body ([vehicle_location_updated]) is not valid JSON.
      // Answer 200 so Motive can enable the webhook.
      return res.status(200).json({ received: true, ignored: true });
    }

    // Motive sends no event ID header: de-duplicate on action + payload id
    if (event && typeof event === 'object' && !Array.isArray(event)) {
      handleMotiveEvent(event);
    }

    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyMotiveSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/motive`);
  });
}
