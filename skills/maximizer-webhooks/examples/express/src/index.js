// Generated with: maximizer-webhooks skill
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
 * Maximizer does not sign payloads. You add a header to the target's Endpoint.Headers
 * and Maximizer sends it on every request. The header name is yours to choose, so it
 * comes from MAXIMIZER_WEBHOOK_HEADER (default "Authorization"). The WHOLE header value
 * is compared with MAXIMIZER_WEBHOOK_SECRET; a "Bearer " prefix is not parsed or stripped.
 * This authenticates the sender only: it does not cover the body and has no replay protection.
 */
function verifyMaximizerRequest(
  headers,
  secret = process.env.MAXIMIZER_WEBHOOK_SECRET,
  headerName = process.env.MAXIMIZER_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const name = headerName.toLowerCase(); // Node lower-cases incoming header names
  const received = headers[name];
  return typeof received === 'string' && safeEqual(received, secret);
}

function handleEvent(webhook) {
  const entity = webhook.Entity;
  // The operation is in Data.Op ("Create", "Update", "Delete"); tolerate other casing.
  const rawOp = (webhook.Data && webhook.Data.Op) || webhook.Op;
  const op = typeof rawOp === 'string' && rawOp
    ? rawOp.charAt(0).toUpperCase() + rawOp.slice(1).toLowerCase()
    : rawOp;

  switch (`${entity}.${op}`) {
    case 'AbEntry.Create':
      console.log(`Contact created: ${webhook.Data.New && webhook.Data.New.Key}`);
      // TODO: add the contact to your system (webhook.Data.New)
      break;

    case 'AbEntry.Update':
      console.log(`Contact updated: ${webhook.Data.New && webhook.Data.New.Key}`);
      // TODO: sync changed fields (webhook.Data.Original vs webhook.Data.New)
      break;

    case 'AbEntry.Delete':
      console.log(`Contact deleted: ${webhook.Data.Original && webhook.Data.Original.Key}`);
      // TODO: remove or archive the contact
      break;

    case 'Opportunity.Create':
      console.log(`Opportunity created: ${webhook.Data.New && webhook.Data.New.Key}`);
      // TODO: open a deal in your system
      break;

    case 'Opportunity.Update':
      console.log(`Opportunity updated: ${webhook.Data.New && webhook.Data.New.Key}`);
      // TODO: handle stage changes (SalesStageSetupName in Original and New)
      break;

    case 'Opportunity.Delete':
      console.log(`Opportunity deleted: ${webhook.Data.Original && webhook.Data.Original.Key}`);
      // TODO: close the matching deal
      break;

    case 'Lead.Create':
      console.log(`Lead created: ${webhook.Data.New && webhook.Data.New.Key}`);
      // TODO: route the lead to sales
      break;

    case 'Lead.Update':
      console.log(`Lead updated: ${webhook.Data.New && webhook.Data.New.Key}`);
      // TODO: sync changed fields
      break;

    case 'Lead.Delete':
      console.log(`Lead deleted: ${webhook.Data.Original && webhook.Data.Original.Key}`);
      // TODO: remove the lead
      break;

    default:
      console.log(`Unhandled event: ${entity}.${op}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/maximizer', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyMaximizerRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
  }

  let events;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    events = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // Maximizer posts a JSON ARRAY of webhook objects.
  if (!Array.isArray(events) || !events.every((e) => e && typeof e === 'object' && !Array.isArray(e))) {
    return res.status(400).json({ error: 'Expected a JSON array of webhook objects' });
  }

  // Maximizer needs a 200 within 2 seconds, so acknowledge first, then do the work.
  res.status(200).json({ received: true });

  for (const webhook of events) {
    try {
      handleEvent(webhook);
    } catch (err) {
      // Already acknowledged: log it, and queue a retry in your own system if needed.
      console.error('Error handling Maximizer event:', err);
    }
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyMaximizerRequest = verifyMaximizerRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/maximizer`);
  });
}
