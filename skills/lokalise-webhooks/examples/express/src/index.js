// Generated with: lokalise-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Lokalise does not sign webhook payloads. It sends the webhook secret you
 * configured as-is in a request header: X-Secret by default, or X-Api-Key / a
 * custom header if you chose one in the Webhooks app. Set LOKALISE_WEBHOOK_HEADER
 * to match.
 */
function verifyLokaliseRequest(headers, config = process.env) {
  const secret = config.LOKALISE_WEBHOOK_SECRET;
  const headerName = (config.LOKALISE_WEBHOOK_HEADER || 'X-Secret').toLowerCase();
  if (!secret) return false; // never accept when unconfigured

  const received = headers[headerName];
  return Boolean(received) && safeEqual(received, secret);
}

/**
 * Event names are the `event` field of the JSON body (also sent in the X-Event header).
 * See https://developers.lokalise.com/docs/webhook-events
 */
function handleEvent(payload) {
  const { event, project = {}, user = {} } = payload;

  switch (event) {
    case 'project.translation.updated':
      console.log(
        `Translation updated in ${project.name} (${payload.language?.iso}): ` +
        `${payload.key?.name} = "${payload.translation?.value}"`
      );
      // TODO: sync the changed string to your app or CDN
      break;

    case 'project.translations.updated':
      console.log(`${payload.translations?.length} translations updated via ${payload.action}`);
      // TODO: sync the bulk change (up to 300 translations per event)
      break;

    case 'project.key.added':
      console.log(`Key added: ${payload.key?.name} by ${user.email}`);
      break;

    case 'project.keys.added':
      console.log(`${payload.keys?.length} keys added via ${payload.action}`);
      // TODO: register the new keys (up to 300 per event)
      break;

    case 'project.key.modified':
    case 'project.keys.modified':
      console.log(`Keys modified in ${project.name}`);
      // TODO: refresh the affected keys
      break;

    case 'project.keys.deleted':
      console.log(`${payload.keys?.length} keys deleted in ${project.name}`);
      // TODO: remove the keys from your app
      break;

    case 'project.task.closed':
      console.log(`Task closed: ${payload.task?.title} (${payload.task?.id})`);
      // TODO: pull the finished translations
      break;

    case 'project.imported':
      console.log(`Files imported into ${project.name}`);
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before
// anything is parsed.
app.post('/webhooks/lokalise', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyLokaliseRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret' });
  }

  let payload = null;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    // Lokalise sends a ping when a webhook is created; it only needs a 2xx.
  }

  if (!payload || typeof payload !== 'object' || typeof payload.event !== 'string') {
    return res.status(200).json({ received: true, ignored: true });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Lokalise event:', err);
    // Non-2xx (or no reply within 8 seconds) makes Lokalise retry for up to 24 hours.
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyLokaliseRequest = verifyLokaliseRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/lokalise`);
  });
}
