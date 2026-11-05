// Generated with: instagram-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i;

/**
 * Verify an Instagram (Meta) webhook signature.
 *
 * Meta sends X-Hub-Signature-256: sha256=<hex>, the HMAC-SHA256 hex digest of
 * the RAW request body keyed with the app secret. The pattern check guarantees
 * exactly 64 hex characters before Buffer.from(x, 'hex') (which silently
 * truncates invalid hex), then the two 32-byte digests are compared in
 * constant time.
 */
function verifyInstagramSignature(rawBody, signatureHeader, appSecret) {
  if (typeof signatureHeader !== 'string' || !appSecret) {
    return false;
  }

  const match = SIGNATURE_PATTERN.exec(signatureHeader);
  if (!match) {
    return false;
  }

  const received = Buffer.from(match[1], 'hex');
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest();

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

/** Field changes: comments, live_comments, mentions, story_insights. */
function handleChange(change, entry) {
  const value = change.value || {};

  switch (change.field) {
    case 'comments':
    case 'live_comments': {
      // Instagram Login samples use value.id; Unified/Facebook Login use value.comment_id.
      const commentId = value.comment_id || value.id;
      console.log(
        `${change.field}: comment ${commentId} by @${value.from?.username} on media ${value.media?.id}`
      );
      // TODO: Moderate or reply to the comment.
      break;
    }

    case 'mentions':
      // comment_id is present only for a mention in a comment.
      console.log(`Mention on media ${value.media_id}${value.comment_id ? ` in comment ${value.comment_id}` : ''}`);
      // TODO: Fetch the media/comment and respond.
      break;

    case 'story_insights':
      console.log(`Story ${value.media_id} insights: reach ${value.reach}, impressions ${value.impressions}`);
      // TODO: Store metrics (counts under 5 are returned as -1).
      break;

    default:
      console.log(`Unhandled Instagram field: ${change.field} (account ${entry.id})`);
  }
}

/** Messaging events: the event is the key present on the item. */
function handleMessagingEvent(event, source) {
  const from = event.sender?.id;

  if (event.message) {
    const msg = event.message;
    if (msg.is_echo) {
      console.log(`Echo of message ${msg.mid} sent by the account to ${event.recipient?.id}`);
    } else if (msg.is_deleted) {
      console.log(`Message ${msg.mid} deleted by ${from}`);
    } else if (msg.admin_text && !msg.mid) {
      console.log(`Handoff notice (${msg.handoff_reason || 'no reason'}) for ${from}`);
    } else {
      const kind = msg.text ? 'text' : (msg.attachments || []).map((a) => a.type).join(',');
      console.log(`Message ${msg.mid} from ${from} (${kind})`);
      // TODO: Reply via the Send API (respond to the webhook first).
    }
  } else if (event.reaction) {
    console.log(`Reaction ${event.reaction.action} ${event.reaction.reaction || ''} on ${event.reaction.mid}`);
  } else if (event.postback) {
    console.log(`Postback "${event.postback.title}" (${event.postback.payload}) from ${from}`);
  } else if (event.referral) {
    console.log(`Referral ref=${event.referral.ref} source=${event.referral.source} from ${from}`);
  } else if (event.read) {
    console.log(`Message ${event.read.mid} seen by ${from}`);
  } else if (event.message_edit) {
    console.log(`Message ${event.message_edit.mid} edited (${event.message_edit.num_edit} edits)`);
  } else {
    console.log(`Unhandled Instagram ${source} event: ${Object.keys(event).join(',')}`);
  }
}

/** Dispatch a notification: { object: 'instagram', entry: [...] }. */
function handleNotification(notification) {
  if (notification.object !== 'instagram') {
    console.log(`Ignoring object: ${notification.object}`);
    return;
  }

  for (const entry of notification.entry || []) {
    for (const change of entry.changes || []) handleChange(change, entry);
    for (const event of entry.messaging || []) handleMessagingEvent(event, 'messaging');
    // Handover protocol: events for threads your app doesn't currently own.
    for (const event of entry.standby || []) handleMessagingEvent(event, 'standby');
  }
}

// Constant-time compare for the GET handshake's hub.verify_token.
function verifyTokenMatches(token, expected) {
  if (typeof token !== 'string' || !token || !expected) return false;
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// GET verification handshake: Meta sends this when the Callback URL is configured.
app.get('/webhooks/instagram', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && verifyTokenMatches(token, process.env.INSTAGRAM_VERIFY_TOKEN)) {
    // Echo the challenge back verbatim as plain text.
    return res.status(200).type('text/plain').send(String(challenge ?? ''));
  }

  return res.status(403).send('Forbidden');
});

// POST event delivery: the raw body is needed for signature verification.
// '*/*' makes sure every content type reaches the verifier as a Buffer.
app.post('/webhooks/instagram', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyInstagramSignature(rawBody, signature, process.env.INSTAGRAM_APP_SECRET)) {
    console.error('Webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after verification.
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Some Meta samples wrap the notification in an array; accept both forms.
  const notifications = Array.isArray(payload) ? payload : [payload];
  if (!notifications.every((n) => n && typeof n === 'object')) {
    return res.status(400).send('Invalid payload');
  }

  notifications.forEach(handleNotification);

  return res.status(200).send('EVENT_RECEIVED');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyInstagramSignature };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/instagram`);
  });
}
