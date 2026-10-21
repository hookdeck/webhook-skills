// Generated with: unipile-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

// Unipile webhooks are NOT signed. There is no signature header, HMAC or timestamp.
// When you create a webhook (POST /api/v1/webhooks or the dashboard) you can add a
// "headers" array, e.g. {"key": "Unipile-Auth", "value": "<secret>"}. Unipile sends
// those headers on every delivery, so a secret there authenticates the sender.
//
// Payload shapes depend on the webhook `source`:
//   messaging / email / email_tracking / users -> a flat object with an `event` field
//   account_status -> { "AccountStatus": { account_id, account_type, message } }

const WEBHOOK_PATH = '/webhooks/unipile';
const DEFAULT_HEADER = 'Unipile-Auth';

const EVENTS = {
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_READ: 'message_read',
  MAIL_RECEIVED: 'mail_received',
  MAIL_SENT: 'mail_sent',
  MAIL_MOVED: 'mail_moved',
  MAIL_OPENED: 'mail_opened',
  MAIL_LINK_CLICKED: 'mail_link_clicked',
  NEW_RELATION: 'new_relation',
};

// Account statuses sent in AccountStatus.message.
const ACCOUNT_STATUS = {
  OK: 'OK',
  CREDENTIALS: 'CREDENTIALS',
};

const app = express();

/**
 * Compare the shared secret from the custom header in constant time.
 *
 * @param {unknown} headerValue - value of the configured header
 * @returns {boolean} true when it matches UNIPILE_WEBHOOK_SECRET
 * @throws {Error} when UNIPILE_WEBHOOK_SECRET is not configured (fail closed)
 */
function verifyUnipileSecret(headerValue) {
  const expected = process.env.UNIPILE_WEBHOOK_SECRET;
  if (!expected) {
    throw new Error('UNIPILE_WEBHOOK_SECRET is not set');
  }
  if (typeof headerValue !== 'string') return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws when lengths differ.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Unipile has no delivery ID header and retries up to 5 times when it doesn't get a
 * 200 within 30 seconds, so build a dedupe key from the payload.
 */
function dedupeKey(payload) {
  if (payload.AccountStatus) {
    const s = payload.AccountStatus;
    return `account_status:${s.account_id}:${s.message}`;
  }
  switch (payload.event) {
    case EVENTS.MAIL_OPENED:
    case EVENTS.MAIL_LINK_CLICKED:
      return payload.event_id ? `${payload.event}:${payload.event_id}` : null;
    case EVENTS.MAIL_RECEIVED:
    case EVENTS.MAIL_SENT:
    case EVENTS.MAIL_MOVED:
      return payload.email_id ? `${payload.event}:${payload.email_id}` : null;
    default:
      return payload.message_id ? `${payload.event}:${payload.message_id}` : null;
  }
}

// --- Event handlers ---------------------------------------------------------

async function handleMessageReceived(payload) {
  // Sent messages are also delivered as message_received. Compare
  // account_info.user_id with sender.attendee_provider_id to spot your own.
  const own =
    payload.account_info && payload.sender &&
    payload.account_info.user_id === payload.sender.attendee_provider_id;
  console.log(
    `Message ${payload.message_id} in chat ${payload.chat_id} (${payload.account_type})` +
      ` from ${payload.sender?.attendee_name ?? 'unknown'}${own ? ' [sent by connected account]' : ''}`
  );
  // TODO: store or forward the message. Attachment urls are att:// references:
  // download them with the Unipile API, not directly.
}

async function handleMessageRead(payload) {
  console.log(`Message ${payload.message_id} read in chat ${payload.chat_id}`);
}

async function handleMailReceived(payload) {
  console.log(`Email ${payload.email_id} "${payload.subject ?? ''}" from ${payload.from_attendee?.identifier ?? 'unknown'}`);
  // TODO: process the email. `origin` is "unipile" for mail sent through the API.
}

async function handleAccountStatus(status) {
  console.log(`Account ${status.account_id} (${status.account_type}) status: ${status.message}`);
  if (status.message !== ACCOUNT_STATUS.OK) {
    // Anything other than OK (e.g. CREDENTIALS) means no more new-message webhooks
    // for this account until it is reconnected.
    // TODO: alert the user and start the reconnect flow.
  }
}

/**
 * Dispatch on the payload shape.
 *
 * @returns {Promise<boolean>} whether the payload was recognised
 */
async function dispatch(payload) {
  if (payload.AccountStatus && typeof payload.AccountStatus === 'object') {
    await handleAccountStatus(payload.AccountStatus);
    return true;
  }
  switch (payload.event) {
    case EVENTS.MESSAGE_RECEIVED:
      await handleMessageReceived(payload);
      return true;
    case EVENTS.MESSAGE_READ:
      await handleMessageRead(payload);
      return true;
    case EVENTS.MAIL_RECEIVED:
      await handleMailReceived(payload);
      return true;
    case EVENTS.MAIL_SENT:
    case EVENTS.MAIL_MOVED:
    case EVENTS.MAIL_OPENED:
    case EVENTS.MAIL_LINK_CLICKED:
    case EVENTS.NEW_RELATION:
      console.log(`Unipile event ${payload.event} (account ${payload.account_id ?? 'n/a'})`);
      return true;
    default:
      // Acknowledge unknown events so Unipile doesn't retry them.
      console.warn(`Unhandled Unipile event: ${payload.event}`);
      return false;
  }
}

// --- Route ------------------------------------------------------------------

/**
 * Check the shared-secret header BEFORE the body is read.
 */
function requireUnipileSecret(req, res, next) {
  const headerName = process.env.UNIPILE_WEBHOOK_HEADER || DEFAULT_HEADER;
  let ok;
  try {
    // req.get() is case-insensitive.
    ok = verifyUnipileSecret(req.get(headerName));
  } catch (err) {
    console.error(`Unipile webhook misconfigured: ${err.message}`);
    return res.status(500).send('Webhook secret not configured');
  }
  if (!ok) {
    console.error(`Unipile webhook rejected: ${headerName} missing or wrong`);
    return res.status(401).send('Invalid webhook secret');
  }
  return next();
}

// Raw body for any content type: webhooks created through the API don't send a JSON
// Content-Type unless you add one in `headers`, so parse the JSON ourselves, and only
// after the secret has been checked.
app.post(
  WEBHOOK_PATH,
  requireUnipileSecret,
  express.raw({ type: '*/*' }),
  async (req, res) => {
    let payload;
    try {
      const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      payload = JSON.parse(text);
    } catch {
      // Also happens if the webhook was created with format "form".
      return res.status(400).send('Invalid JSON');
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      (typeof payload.event !== 'string' && !payload.AccountStatus)
    ) {
      return res.status(400).send('Missing event field');
    }

    console.log(`Unipile webhook: ${payload.event ?? 'account_status'} key=${dedupeKey(payload)}`);

    try {
      await dispatch(payload);
    } catch (err) {
      console.error(`Unipile webhook processing failed: ${err.message}`);
      // Unipile retries up to 5 times unless it gets a 200 within 30 seconds.
      return res.status(500).send('Processing failed');
    }

    return res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, EVENTS, ACCOUNT_STATUS, verifyUnipileSecret, dedupeKey, dispatch };

// Start the server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  if (!process.env.UNIPILE_WEBHOOK_SECRET) {
    console.warn('UNIPILE_WEBHOOK_SECRET is not set: every delivery will get a 500 (fail closed).');
  }
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}${WEBHOOK_PATH}`);
  });
}
