// Generated with: cronofy-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Verify a Cronofy push notification.
 *
 * Cronofy computes HMAC-SHA256 over the RAW request body, keyed with your
 * application's OAuth client secret (prefixed `CRN_`), base64-encoded. There is
 * no separate webhook signing secret.
 *
 * The `Cronofy-HMAC-SHA256` header is a COMMA-SEPARATED LIST of digests — one per
 * active client secret, because Cronofy supports secret rotation. The delivery is
 * authentic if ANY element matches. Comparing the whole header string works until
 * a rotation starts, then rejects everything.
 *
 * Nothing else is signed: no timestamp, no nonce, no channel id, no URL, no
 * method. Body only.
 *
 * @param {Buffer|string} rawBody   Raw, unparsed request body
 * @param {string} hmacHeader       Cronofy-HMAC-SHA256 header value
 * @param {string} clientSecret     Cronofy application client secret (CRN_...)
 * @returns {boolean}
 */
function verifyCronofyWebhook(rawBody, hmacHeader, clientSecret) {
  if (!hmacHeader || !clientSecret) return false;

  const expected = Buffer.from(
    crypto.createHmac('sha256', clientSecret).update(rawBody).digest('base64')
  );

  // reduce, not some: every candidate is compared, so the position of a match
  // isn't observable via timing.
  return hmacHeader.split(',').reduce((matched, candidate) => {
    const buf = Buffer.from(candidate.trim());
    // Guard the length first — timingSafeEqual throws on a length mismatch.
    const ok = buf.length === expected.length && crypto.timingSafeEqual(buf, expected);
    return matched || ok;
  }, false);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Cronofy push notification endpoint.
 *
 * express.raw() keeps the body as a Buffer — the HMAC covers the exact bytes
 * Cronofy sent, so it must not be parsed before verification.
 */
app.post('/webhooks/cronofy', express.raw({ type: 'application/json' }), (req, res) => {
  const rawBody = req.body;

  // Cronofy sends `Content-Type: application/json; charset=utf-8`. If a different
  // content type slips through, express.raw() leaves req.body as {} rather than a Buffer.
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).send('Expected a raw JSON body');
  }

  // Node lowercases incoming header names.
  const hmacHeader = req.headers['cronofy-hmac-sha256'];

  if (!hmacHeader) {
    console.error('Missing Cronofy-HMAC-SHA256 header');
    return res.status(400).send('Missing signature header');
  }

  // 1. Verify BEFORE parsing or doing anything else. The HMAC header is the only
  //    credential Cronofy sends.
  if (!verifyCronofyWebhook(rawBody, hmacHeader, process.env.CRONOFY_CLIENT_SECRET)) {
    console.error('Cronofy webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // 2. Parse only after the signature checks out.
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const notification = payload.notification || {};
  const channel = payload.channel || {};
  const type = notification.type;

  if (!type || typeof type !== 'string') {
    return res.status(400).send('Missing notification.type');
  }

  console.log(`✓ Verified Cronofy notification: ${type} (channel=${channel.channel_id})`);

  // 3. Acknowledge immediately. Cronofy requires a 2xx within 5 SECONDS. Failed
  //    deliveries are retried for 24 hours and then the CHANNEL IS CLOSED
  //    automatically — a slow handler doesn't drop one event, it kills the channel.
  res.status(200).json({ received: true });

  // 4. Do the real work after responding. Cronofy has no replay protection
  //    (nothing but the body is signed), so handlers must be idempotent —
  //    make the downstream Read Events sync an upsert on event_uid.
  setImmediate(() => {
    try {
      handleNotification(type, notification, channel);
    } catch (err) {
      console.error(`Error handling ${type}:`, err);
    }
  });
});

/**
 * Dispatch on `notification.type` — a BODY field. Cronofy sends no event-type header.
 */
function handleNotification(type, notification, channel) {
  switch (type) {
    case 'verification':
      // Sent right after a channel is created to test the callback URL.
      // There is NO token to echo and NO challenge to reflect — a 2xx is the
      // entire handshake, and we already sent it.
      console.log(`🔍 Channel ${channel.channel_id} verified: ${channel.callback_url}`);
      break;

    case 'change':
      // THIN NOTIFICATION: the payload does NOT contain the changed events.
      // You must follow up with Read Events using changes_since.
      handleChange(notification.changes_since, channel);
      break;

    case 'profile_disconnected':
      // Fires when Cronofy NEXT tries to access the profile, not at the moment
      // the user revoked access. Current state: UserInfo ["cronofy.data"]["profiles"].
      console.log(`🔌 Calendar profile disconnected (channel=${channel.channel_id})`);
      // Your code: prompt the user to reauthorize; pause syncs for that profile.
      break;

    case 'conferencing_profile_disconnected':
      // State: UserInfo ["cronofy.data"]["conferencing_profiles"].
      console.log(`🎥 Conferencing profile disconnected (channel=${channel.channel_id})`);
      // Your code: prompt reconnect before creating meetings with conferencing.
      break;

    case 'profile_initial_sync_completed':
      // NOT sent if the initial sync completed before this channel existed.
      console.log(`✅ Initial calendar sync completed (channel=${channel.channel_id})`);
      // Your code: run a full read now that the calendar data is complete.
      break;

    case 'gdpr_requested':
      // The account invoked their right to be forgotten.
      console.log(`🗑️  GDPR erasure requested (channel=${channel.channel_id})`);
      // Your code: delete this account's data on your side.
      break;

    default:
      // Cronofy: "your code should be tolerant of others, by ignoring them, so if
      // more are introduced in future your integration will not fail."
      // We already returned 200 — just log and move on.
      console.log(`❓ Unhandled Cronofy notification type "${type}"`);
  }
}

/**
 * Fetch what actually changed.
 *
 * `changes_since` goes straight into Read Events as `last_modified`. The call MUST
 * hit the same data centre the account belongs to (api.cronofy.com,
 * api-uk.cronofy.com, api-de.cronofy.com, api-au.cronofy.com, api-ca.cronofy.com,
 * api-sg.cronofy.com).
 *
 * Cronofy does NOT send notifications for changes caused by your own API calls, so
 * don't wait for an echo of your own writes.
 */
function handleChange(changesSince, channel) {
  if (!changesSince) {
    console.warn('change notification without changes_since — skipping delta read');
    return;
  }

  const dataCenterUrl = process.env.CRONOFY_DATA_CENTER_URL || 'https://api.cronofy.com';
  const calendarIds = channel.filters?.calendar_ids;

  console.log(`📅 Changes since ${changesSince}`);
  if (calendarIds) {
    console.log(`   restricted to calendars: ${calendarIds.join(', ')}`);
  }

  // Your code: replace with a real, authenticated, paginated read:
  //
  //   const url = new URL('/v1/events', dataCenterUrl);
  //   url.searchParams.set('tzid', 'Etc/UTC');
  //   url.searchParams.set('last_modified', changesSince);
  //   const res = await fetch(url, {
  //     headers: { Authorization: `Bearer ${accessTokenFor(channel.channel_id)}` },
  //   });
  //   // then follow res.pages.next_page until exhausted, upserting on event_uid
  console.log(`   would GET ${dataCenterUrl}/v1/events?tzid=Etc/UTC&last_modified=${changesSince}`);
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server (skipped during tests)
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Cronofy webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/cronofy`);
    if (!process.env.CRONOFY_CLIENT_SECRET) {
      console.warn('⚠️  Warning: CRONOFY_CLIENT_SECRET not set');
    }
  });
}

module.exports = { app, server, verifyCronofyWebhook };
