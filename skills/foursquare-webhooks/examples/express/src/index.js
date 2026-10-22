// Generated with: foursquare-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Hash both sides so the buffers are always the same length
// (crypto.timingSafeEqual throws when lengths differ).
const sha256 = (value) => crypto.createHash('sha256').update(value).digest();

/**
 * Verify the Pilgrim-Secret header on a Foursquare Movement SDK webhook.
 *
 * Foursquare does NOT sign payloads. Every request carries the secret from the
 * Developer Console's Pilgrim page, raw with no prefix, in `Pilgrim-Secret`.
 *
 * @param {string|undefined} headerValue - Pilgrim-Secret header value
 * @param {string|undefined} expectedSecret - FOURSQUARE_PILGRIM_SECRET
 * @returns {boolean}
 */
function verifyPilgrimSecret(headerValue, expectedSecret) {
  if (!headerValue || !expectedSecret) return false;
  return crypto.timingSafeEqual(sha256(headerValue), sha256(expectedSecret));
}

function handleFoursquareEvent(event) {
  switch (event.eventType) {
    case 'placeArrival': {
      const venue = event.placeEvent?.venues?.[0];
      console.log(`Arrival at ${venue?.name ?? 'unknown place'} (visit ${event.pilgrimVisitId})`);
      // TODO: Log the visit or send a notification
      break;
    }
    case 'placeDeparture': {
      const venue = event.placeEvent?.venues?.[0];
      console.log(`Departure from ${venue?.name ?? 'unknown place'} (visit ${event.pilgrimVisitId})`);
      // TODO: Close out the visit
      break;
    }
    case 'placeHistorical':
      console.log(`Historical visit ${event.pilgrimVisitId}`);
      // TODO: Backfill visit history
      break;
    case 'geofenceEnter':
    case 'geofenceDwell':
    case 'geofencePresence':
    case 'geofenceExit':
      console.log(`${event.eventType} for geofence ${event.geofenceEvent?.geofenceId}`);
      // TODO: Trigger location-based logic
      break;
    case 'journeysInProgress':
    case 'journeysApproaching':
    case 'journeysArrived':
    case 'journeysCompleted':
    case 'journeysCanceled':
      console.log(`${event.eventType} for journey ${event.journeyId}`);
      // TODO: Update trip state
      break;
    default:
      console.log(`Unhandled Foursquare event: ${event.eventType ?? 'unknown'}`);
  }
}

// Read the raw body for any content type; parse JSON only after the secret checks out
app.post('/webhooks/foursquare', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  const secret = process.env.FOURSQUARE_PILGRIM_SECRET;

  // Fail closed: without a configured secret there is nothing to check.
  if (!secret) {
    console.error('FOURSQUARE_PILGRIM_SECRET is not set');
    return res.status(500).send('Webhook authentication not configured');
  }

  if (!verifyPilgrimSecret(req.headers['pilgrim-secret'], secret)) {
    console.error('Foursquare Pilgrim-Secret verification failed');
    return res.status(401).send('Unauthorized');
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).send('Invalid payload');
  }

  handleFoursquareEvent(event);

  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = { app, verifyPilgrimSecret };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/foursquare`);
  });
}
