// Generated with: nextcloud-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// httpMethod is a free string chosen when the webhook is registered.
const ALLOWED_METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'];

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
 * Nextcloud does not sign payloads. With authMethod 'header', webhook_listeners merges
 * authData ({header: value}) into the request headers. The header name is user-chosen, so
 * both it and the expected value come from the environment. The WHOLE value is compared
 * (a "Bearer " prefix typed into authData is part of the secret, not parsed off).
 */
function verifyNextcloudRequest(
  headers,
  secret = process.env.NEXTCLOUD_WEBHOOK_SECRET,
  headerName = process.env.NEXTCLOUD_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

function handleEvent(payload) {
  const cls = payload.event && payload.event.class;
  const uid = payload.user ? payload.user.uid : null;
  const node = payload.event && payload.event.node;

  switch (cls) {
    case 'OCP\\Files\\Events\\Node\\NodeCreatedEvent':
      console.log(`File created by ${uid}: ${node && node.path}`);
      // TODO: index the new file or kick off processing
      break;

    case 'OCP\\Files\\Events\\Node\\NodeWrittenEvent':
      console.log(`File written by ${uid}: ${node && node.path}`);
      // TODO: re-process the changed file
      break;

    case 'OCP\\Files\\Events\\Node\\NodeTouchedEvent':
      console.log(`File touched by ${uid}: ${node && node.path}`);
      break;

    case 'OCP\\Files\\Events\\Node\\NodeDeletedEvent':
      // node.id is usually absent here; only node.path is present
      console.log(`File deleted by ${uid}: ${node && node.path}`);
      // TODO: remove the file from your index
      break;

    case 'OCP\\Files\\Events\\Node\\NodeCopiedEvent':
    case 'OCP\\Files\\Events\\Node\\NodeRenamedEvent':
    case 'OCP\\Files\\Events\\Node\\NodeRestoredEvent':
      // two-node events carry event.source and event.target (either may lack an id)
      console.log(`${cls.split('\\').pop()} by ${uid}: ${payload.event.source && payload.event.source.path} -> ${payload.event.target && payload.event.target.path}`);
      // TODO: update your copy of the path
      break;

    case 'OCP\\SystemTag\\TagAssignedEvent':
    case 'OCP\\SystemTag\\TagUnassignedEvent':
      console.log(`${cls.split('\\').pop()} by ${uid}`);
      // TODO: sync tags
      break;

    case 'OCP\\Calendar\\Events\\CalendarObjectCreatedEvent':
    case 'OCP\\Calendar\\Events\\CalendarObjectUpdatedEvent':
    case 'OCP\\Calendar\\Events\\CalendarObjectDeletedEvent':
      console.log(`${cls.split('\\').pop()} by ${uid} (calendar ${payload.event.calendarId})`);
      // TODO: sync the calendar object
      break;

    case 'OCA\\Forms\\Events\\FormSubmittedEvent':
      console.log(`Form submitted by ${uid}`);
      // TODO: process the submission
      break;

    default:
      console.log(`Unhandled event: ${cls}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.all('/webhooks/nextcloud', express.raw({ type: '*/*' }), (req, res) => {
  if (!ALLOWED_METHODS.includes(req.method)) {
    res.set('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyNextcloudRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
  }

  // GET/DELETE and some senders have no body: acknowledge it.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (raw.trim() === '') {
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
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
    console.error('Error handling Nextcloud event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyNextcloudRequest = verifyNextcloudRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/nextcloud`);
  });
}
