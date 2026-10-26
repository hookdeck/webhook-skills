// Generated with: plunk-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// The webhook step's method is a literal verb chosen by the user (default POST).
const WEBHOOK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Constant-time string comparison. Lengths are checked first because timingSafeEqual
 * throws on unequal lengths.
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Plunk does not sign webhooks. You add a secret header on the workflow's webhook step;
 * the header name is yours (PLUNK_WEBHOOK_HEADER, default Authorization) and the expected
 * value is the WHOLE header value (PLUNK_WEBHOOK_SECRET), including any "Bearer " prefix.
 * No prefix is stripped or parsed.
 */
function verifyPlunkRequest(
  headers,
  secret = process.env.PLUNK_WEBHOOK_SECRET,
  headerName = process.env.PLUNK_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

/**
 * The wire has no Plunk-defined event-name field: the trigger (email.bounce, ...) only
 * selects the workflow. For the default body we infer the kind from the documented
 * fields of body.event. A custom body replaces the default entirely, so this may be null.
 */
function classifyEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if ('bouncedAt' in event || 'bounceType' in event) return 'email.bounce';
  if ('complainedAt' in event) return 'email.complaint';
  if ('clickedAt' in event) return 'email.click';
  if ('openedAt' in event) return 'email.open';
  if ('deliveredAt' in event) return 'email.delivery';
  if ('sentAt' in event) return 'email.sent';
  if ('spfVerdict' in event || 'recipients' in event) return 'email.received';
  if ('segmentId' in event) return 'segment';
  return null;
}

function handleEvent(payload) {
  // Default body: { contact, workflow, execution, event }
  const { contact, workflow, event } = payload || {};
  const kind = classifyEvent(event);

  switch (kind) {
    case 'email.bounce':
      console.log(`Email bounced (${event.bounceType}) for ${contact && contact.email}`);
      // TODO: mark the address undeliverable (event.emailId, event.transientBounce)
      break;

    case 'email.complaint':
      console.log(`Spam complaint from ${contact && contact.email}`);
      // TODO: suppress the contact in your own database
      break;

    case 'email.click':
      console.log(`Link clicked by ${contact && contact.email}: ${event.link}`);
      break;

    case 'email.open':
      console.log(`Email opened by ${contact && contact.email}`);
      break;

    case 'email.delivery':
      console.log(`Email delivered to ${contact && contact.email}`);
      break;

    case 'email.sent':
      console.log(`Email sent to ${contact && contact.email}`);
      break;

    case 'email.received':
      console.log(`Inbound email from ${event.from}`);
      break;

    case 'segment':
      console.log(`Segment event for ${event.segmentName}`);
      break;

    default:
      // Contact events, custom events and custom bodies land here: plain JSON.
      console.log(`Plunk webhook${workflow && workflow.name ? ` from workflow "${workflow.name}"` : ''}`);
  }
}

// Read the body raw (any content type) and parse only after the credential check.
// One route for every method the webhook step can use.
app.all('/webhooks/plunk', express.raw({ type: '*/*' }), (req, res) => {
  if (!WEBHOOK_METHODS.includes(req.method)) {
    res.set('Allow', WEBHOOK_METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyPlunkRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing secret header' });
  }

  // GET/DELETE and custom bodies may be empty.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let payload = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Plunk webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPlunkRequest = verifyPlunkRequest;
module.exports.classifyEvent = classifyEvent;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: ${WEBHOOK_METHODS.join('|')} http://localhost:${PORT}/webhooks/plunk`);
  });
}
