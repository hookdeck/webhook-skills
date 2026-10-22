// Generated with: fourkites-webhooks skill
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
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * FourKites does not sign callbacks. With Basic auth every request carries
 * 'Authorization: Basic base64(username:password)'. This authenticates the sender,
 * not the body, and gives no replay protection: use HTTPS and rotate on leak.
 * The credentials must arrive on the first request (no 401 + WWW-Authenticate challenge).
 */
function verifyFourKitesRequest(
  headers,
  user = process.env.FOURKITES_WEBHOOK_USERNAME,
  pass = process.env.FOURKITES_WEBHOOK_PASSWORD
) {
  if (!user || !pass) return false; // never accept when unconfigured
  const m = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(headers['authorization'] || ''); // scheme is case-insensitive
  if (!m) return false;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':'); // split on the first colon
  if (i < 0) return false;
  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.slice(0, i), user);
  const passOk = safeEqual(decoded.slice(i + 1), pass);
  return userOk && passOk;
}

function handleEvent(payload) {
  const { MessageType: type, LoadNumber: load } = payload;

  switch (type) {
    case 'LOAD_CREATION':
      console.log(`Load created: ${load} (FourKitesLoadId ${payload.FourKitesLoadId})`);
      // TODO: store FourKitesLoadId against your load
      break;

    case 'LOCATION_UPDATE':
      console.log(`Location update: ${load}`);
      // TODO: update the live map
      break;

    case 'TRACKING_UPDATE':
      console.log(`Tracking update: ${load} ${payload.Status || ''} ${payload.Message || ''}`);
      // TODO: raise delay or status alerts
      break;

    case 'STOP_ETA_UPDATED':
      console.log(`Stop ETA updated: ${load}`);
      // TODO: re-plan dock appointments
      break;

    case 'STOP_ARRIVAL':
      console.log(`Stop arrival: ${load} at ${payload.StopName}`);
      // TODO: start the detention clock
      break;

    case 'STOP_DEPARTURE':
      console.log(`Stop departure: ${load} from ${payload.StopName}`);
      // TODO: advance pickup/delivery progress
      break;

    case 'STOP_AUTO_COMPLETED':
      console.log(`Stop auto-completed: ${load}`);
      // TODO: close out the stop
      break;

    case 'MANUALLY_DELIVERED':
      console.log(`Manually delivered: ${load}`);
      // TODO: close the shipment
      break;

    case 'MANUALLY_PICKED_UP':
      console.log(`Manually picked up: ${load}`);
      // TODO: start in-transit tracking
      break;

    case 'STOP_APPOINTMENT_RESCHEDULED':
      console.log(`Stop appointment rescheduled: ${load}`);
      // TODO: sync appointments
      break;

    case 'STOP_AMEND':
      console.log(`Stop amended: ${load}`);
      // TODO: sync stop details
      break;

    case 'LOAD_DELETED':
      console.log(`Load deleted: ${load}`);
      // TODO: remove it downstream
      break;

    default:
      console.log(`Unhandled MessageType: ${type}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/fourkites', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyFourKitesRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
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
    console.error('Error handling FourKites callback:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyFourKitesRequest = verifyFourKitesRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/fourkites`);
  });
}
