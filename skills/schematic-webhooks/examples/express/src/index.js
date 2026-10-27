// Generated with: schematic-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a Schematic webhook.
 *
 * Signature = lowercase hex HMAC-SHA256(secret, rawBody + "+" + timestamp), sent
 * as the bare digest in X-Schematic-Webhook-Signature (no prefix). The timestamp
 * is the X-Schematic-Webhook-Timestamp header, used exactly as received.
 *
 * @param {Buffer} rawBody       Raw, unparsed request body bytes
 * @param {string|undefined} signature  X-Schematic-Webhook-Signature
 * @param {string|undefined} timestamp  X-Schematic-Webhook-Timestamp
 * @param {string|undefined} secret     SCHEMATIC_WEBHOOK_SECRET
 * @param {number} toleranceSeconds     0 = no replay window (default)
 * @returns {{ valid: boolean, error?: string }}
 */
function verifySchematicSignature(rawBody, signature, timestamp, secret, toleranceSeconds = 0) {
  if (!signature) return { valid: false, error: 'Missing signature header' };
  if (!timestamp) return { valid: false, error: 'Missing timestamp header' };
  if (!secret) return { valid: false, error: 'Webhook secret not configured' };

  // Validate format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_SHA256.test(signature)) return { valid: false, error: 'Malformed signature' };

  // Body bytes + "+" + header string (latin1, never trimmed or re-formatted).
  const signedContent = Buffer.concat([
    rawBody,
    Buffer.from('+', 'utf8'),
    Buffer.from(timestamp, 'latin1'),
  ]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signedContent).digest();
  const provided = Buffer.from(signature, 'hex'); // 64 hex chars -> 32 bytes, case-insensitive

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { valid: false, error: 'Signature mismatch' };
  }

  // Opt-in only. Retries and Hookdeck replays resend the original timestamp.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return { valid: false, error: 'Malformed timestamp' };
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (age > toleranceSeconds) return { valid: false, error: 'Timestamp outside tolerance' };
  }

  return { valid: true };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// express.raw with '*/*' so any content type reaches the handler as exact bytes.
app.post('/webhooks/schematic', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const secret = process.env.SCHEMATIC_WEBHOOK_SECRET;

  if (!secret) {
    console.error('SCHEMATIC_WEBHOOK_SECRET is not set; refusing to accept unverified webhooks');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const tolerance = Number(process.env.SCHEMATIC_WEBHOOK_TOLERANCE_SECONDS || 0);
  const result = verifySchematicSignature(
    rawBody,
    req.get('x-schematic-webhook-signature'),
    req.get('x-schematic-webhook-timestamp'),
    secret,
    Number.isFinite(tolerance) ? tolerance : 0
  );

  if (!result.valid) {
    console.error(`Schematic signature verification failed: ${result.error}`);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Verified: only now is it safe to parse.
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  // event_id is stable across retries (also sent as X-Schematic-Webhook-Id). Dashboard
  // test sends carry neither, so don't require it.
  const eventId = event.event_id || req.get('x-schematic-webhook-id') || null;

  // Acknowledge with a 2xx within 5 seconds, then do the work.
  res.status(200).json({ received: true });

  setImmediate(() => {
    try {
      handleEvent(event, eventId);
    } catch (err) {
      console.error(`Error handling Schematic event ${eventId}:`, err);
    }
  });
});

function handleEvent(event, eventId) {
  // TODO: drop the event if eventId is already in your store (when eventId is set).
  const { action, body = {} } = event;

  switch (action) {
    // Company & user events
    case 'company.created':
    case 'company.updated':
    case 'company.deleted':
    case 'company.plan_changed':
    case 'company.override.created':
    case 'company.override.updated':
    case 'company.override.deleted':
    case 'company.override.expired':
    case 'user.created':
    case 'user.updated':
    case 'user.deleted':
      console.log(`Company/user event ${action} (company ${event.company_id || body.id || 'n/a'})`);
      break;

    // Catalog events
    case 'feature.created':
    case 'feature.updated':
    case 'feature.deleted':
    case 'flag.created':
    case 'flag.updated':
    case 'flag.deleted':
    case 'flag_rules.updated':
    case 'rule.deleted':
    case 'plan.created':
    case 'plan.updated':
    case 'plan.deleted':
    case 'plan_version.deleted':
    case 'plan.entitlement.created':
    case 'plan.entitlement.updated':
    case 'plan.entitlement.deleted':
      console.log(`Catalog event ${action} (${event.object_type || 'unknown object'})`);
      break;

    // Billing events
    case 'subscription.trial.ended':
      console.log('Trial ended for a subscription');
      break;

    // Usage-based trigger events
    case 'entitlement.limit.reached':
    case 'entitlement.limit.warning':
    case 'entitlement.soft_limit.reached':
    case 'entitlement.soft_limit.warning':
    case 'entitlement.tier_limit.reached':
    case 'entitlement.tier_limit.warning':
    case 'credit.limit.reached':
    case 'credit.limit.warning':
    case 'credit.purchase.success':
    case 'auto.topup.hard.failure':
    case 'auto.topup.retry.exceeded':
    case 'auto.topup.success':
      console.log(`Usage event ${action} (company ${event.company_id || 'n/a'}, feature ${event.feature_id || 'n/a'})`);
      break;

    default:
      console.log(`Unhandled Schematic event: ${action}`);
  }
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Schematic webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/schematic`);
    if (!process.env.SCHEMATIC_WEBHOOK_SECRET) {
      console.warn('SCHEMATIC_WEBHOOK_SECRET is not set; every delivery will be rejected');
    }
  });
}

module.exports = { app, server, verifySchematicSignature };
