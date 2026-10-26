// Generated with: copper-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const TYPES = ['lead', 'person', 'company', 'opportunity', 'project', 'task', 'activity_log'];
const EVENTS = ['new', 'update', 'delete'];

/**
 * Constant-time string comparison. timingSafeEqual throws on unequal lengths,
 * so check lengths first and only compare equal-length Buffers.
 */
function safeEqual(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Copper does not sign payloads. Authenticate with a secret header you add through the
 * subscription's "headers" object. The header name is yours (COPPER_WEBHOOK_HEADER) and the
 * expected value is the exact, whole header value (COPPER_WEBHOOK_SECRET): no 'Bearer ' parsing.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
function verifyCopperRequest(headers, expected = process.env.COPPER_WEBHOOK_SECRET) {
  if (!expected) return false; // never accept when unconfigured
  const name = (process.env.COPPER_WEBHOOK_HEADER || 'X-Webhook-Secret').toLowerCase();
  const received = headers[name]; // Node lowercases incoming header names
  return Boolean(received) && safeEqual(received, expected);
}

function handleEvent(payload) {
  const { ids, type, event } = payload;

  // Dispatch on type + event.
  switch (`${type}.${event}`) {
    case 'person.new':
      console.log(`New person(s): ${ids.join(', ')}`);
      // TODO: fetch GET /people/{id} and sync to your system
      break;

    case 'person.update':
      console.log(`Person(s) updated: ${ids.join(', ')}`, payload.updated_attributes || {});
      // TODO: apply payload.updated_attributes
      break;

    case 'opportunity.update':
      console.log(`Opportunity(ies) updated: ${ids.join(', ')}`);
      // TODO: check stage / status changes
      break;

    case 'lead.delete':
      console.log(`Lead(s) deleted: ${ids.join(', ')}`);
      // TODO: remove the leads downstream
      break;

    default:
      if (TYPES.includes(type) && EVENTS.includes(event)) {
        console.log(`Copper ${type} ${event}: ${ids.join(', ')}`);
        // TODO: handle company, project, task and activity_log records
      } else {
        console.log(`Unhandled event: ${type}.${event}`);
      }
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/copper', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyCopperRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (
    !payload || typeof payload !== 'object' || Array.isArray(payload) ||
    !Array.isArray(payload.ids) || typeof payload.type !== 'string' || typeof payload.event !== 'string'
  ) {
    return res.status(400).json({ error: 'Expected an object with ids, type and event' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Copper event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyCopperRequest = verifyCopperRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/copper`);
  });
}
