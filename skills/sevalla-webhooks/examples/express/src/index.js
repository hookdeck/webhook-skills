// Generated with: sevalla-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Sevalla does not sign requests. The svl-signature header is NOT a signature: it carries
 * the webhook's signing secret itself (whsec_ + 30 characters). Compare the whole value
 * with the stored secret. The old secret is accepted too while a rollover is under way.
 */
function verifySevallaRequest(
  headers,
  secrets = [process.env.SEVALLA_WEBHOOK_SECRET, process.env.SEVALLA_WEBHOOK_SECRET_OLD]
) {
  const received = headers['svl-signature'];
  if (typeof received !== 'string') return false;
  return secrets.filter(Boolean).some((secret) => safeEqual(received, secret));
}

// event_id is the same on every retry. Use a shared store (Redis, a database) in production.
const seenEvents = new Set();

function handleEvent(payload) {
  const { type, data = {} } = payload;

  switch (type) {
    case 'APP_CREATE':
      console.log(`Application created: ${data.display_name} (${data.id})`);
      // TODO: register the application in your inventory
      break;

    case 'APP_DEPLOY':
      console.log(`Application deployment ${data.status}: ${data.app_display_name} (${data.deployment_id})`);
      // TODO: notify chat on 'failed', run tests on 'success' (data.is_preview marks preview apps)
      break;

    case 'APP_UPDATE':
      console.log(`Application updated: ${data.display_name} (${data.id})`);
      // TODO: refresh your inventory
      break;

    case 'APP_DELETE':
      console.log(`Application deleted: ${data.display_name} (${data.id})`);
      // TODO: clean up
      break;

    case 'STATIC_SITE_CREATE':
      console.log(`Static site created: ${data.display_name} (${data.id})`);
      // TODO: register the static site
      break;

    case 'STATIC_SITE_DEPLOY':
      console.log(`Static site deployment ${data.status}: ${data.static_site_display_name} (${data.deployment_id})`);
      // TODO: purge caches or notify on 'success'
      break;

    case 'STATIC_SITE_UPDATE':
      console.log(`Static site updated: ${data.display_name} (${data.id})`);
      // TODO: refresh your inventory
      break;

    case 'STATIC_SITE_DELETE':
      console.log(`Static site deleted: ${data.display_name} (${data.id})`);
      // TODO: clean up
      break;

    case 'DATABASE_CREATE':
    case 'DATABASE_UPDATE':
    case 'DATABASE_DELETE':
      // Selectable in the dashboard but not sent by Sevalla at the moment.
      console.log(`Database event: ${type}`);
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

// Read the body raw (any content type); authenticate before parsing it.
app.post('/webhooks/sevalla', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifySevallaRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing svl-signature' });
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

  if (payload.event_id) {
    if (seenEvents.has(payload.event_id)) {
      return res.status(200).json({ received: true, duplicate: true });
    }
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Sevalla event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (payload.event_id) seenEvents.add(payload.event_id);
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifySevallaRequest = verifySevallaRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/sevalla`);
  });
}
