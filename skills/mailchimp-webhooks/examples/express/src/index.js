// Generated with: mailchimp-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Timing-safe compare of the ?secret= query param against the stored secret.
 *
 * Mailchimp does NOT sign its webhooks — there is no HMAC or signature header.
 * You secure the endpoint by registering the webhook URL with an unguessable
 * secret in the query string and validating it here on every POST.
 *
 * @param {string} provided - The `secret` query parameter from the request
 * @param {string} expected - Your stored MAILCHIMP_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyMailchimpSecret(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — guard first.
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Parse Mailchimp's form-encoded body (bracket notation) into a nested object.
 * "data[merges][FNAME]=x" -> { data: { merges: { FNAME: 'x' } } }
 *
 * Express's urlencoded parser with { extended: true } already nests bracket
 * keys via the `qs` library, so req.body arrives in this shape.
 */

// Mailchimp's URL-validation ping is a GET — respond 200 so the webhook saves.
// Do not require the secret here; it's a liveness check, not a data delivery.
app.get('/webhooks/mailchimp', (req, res) => {
  res.status(200).send('OK');
});

// Event delivery is a POST with application/x-www-form-urlencoded.
// extended: true makes `qs` expand data[merges][FNAME] into nested objects.
app.post('/webhooks/mailchimp',
  express.urlencoded({ extended: true }),
  (req, res) => {
    if (!verifyMailchimpSecret(req.query.secret, process.env.MAILCHIMP_WEBHOOK_SECRET)) {
      console.error('Mailchimp secret verification failed');
      return res.status(401).send('Unauthorized');
    }

    const { type, data = {} } = req.body || {};

    try {
      dispatchMailchimpEvent(type, data);
    } catch (err) {
      console.error('Error handling Mailchimp event:', err);
      return res.status(500).send('Server error');
    }

    return res.status(200).send('OK');
  }
);

// Dispatch on the top-level `type` field.
function dispatchMailchimpEvent(type, data) {
  switch (type) {
    case 'subscribe':
      handleSubscribe(data);
      break;
    case 'unsubscribe':
      handleUnsubscribe(data);
      break;
    case 'profile':
      handleProfileUpdate(data);
      break;
    case 'upemail':
      handleEmailChanged(data);
      break;
    case 'cleaned':
      handleCleaned(data);
      break;
    case 'campaign':
      handleCampaign(data);
      break;
    default:
      console.log('Unhandled Mailchimp event type:', type);
  }
}

function handleSubscribe(data) {
  console.log(`Subscribe: ${data.email} joined list ${data.list_id}`);
  // TODO: upsert the contact into your CRM/DB
}

function handleUnsubscribe(data) {
  // data.action is 'unsub' or 'delete'; data.reason is 'manual' or 'abuse'
  console.log(`Unsubscribe (${data.action}/${data.reason}): ${data.email} from list ${data.list_id}`);
  // TODO: suppress the contact / update marketing consent
}

function handleProfileUpdate(data) {
  console.log(`Profile update: ${data.email} on list ${data.list_id}`);
  // TODO: sync updated merge fields (data.merges)
}

function handleEmailChanged(data) {
  console.log(`Email changed: ${data.old_email} -> ${data.new_email} on list ${data.list_id}`);
  // TODO: re-key the contact by data.new_id / data.new_email
}

function handleCleaned(data) {
  // data.reason is 'hard' (bounce) or 'abuse' (spam complaint)
  console.log(`Cleaned (${data.reason}): ${data.email} on list ${data.list_id}`);
  // TODO: mark the address undeliverable
}

function handleCampaign(data) {
  console.log(`Campaign ${data.id} "${data.subject}" status: ${data.status}`);
  // TODO: trigger post-send reporting/automation
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyMailchimpSecret };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/mailchimp?secret=...`);
  });
}
