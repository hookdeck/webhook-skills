// Generated with: messenger-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i;

/**
 * Verify a Facebook Messenger (Meta) webhook signature.
 *
 * Meta sends X-Hub-Signature-256: sha256=<hex>, the HMAC-SHA256 hex digest of
 * the request body keyed with the App Secret. Meta signs the escaped-unicode
 * payload (e.g. "ä" rather than "ä"), so the HMAC must run over the RAW
 * bytes as received, never over re-serialized JSON. The pattern check
 * guarantees 64 hex characters before Buffer.from(x, 'hex'), then the two
 * 32-byte digests are compared in constant time.
 */
function verifyMessengerSignature(rawBody, signatureHeader, appSecret) {
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

/**
 * Name the Messenger field an item belongs to. The payload carries one event
 * key per messaging[] item rather than the subscribed field's name.
 */
function eventType(event) {
  if (event.message) return event.message.is_echo ? 'message_echoes' : 'messages';
  if (event.postback) return 'messaging_postbacks';
  if (event.read) return 'message_reads';
  if (event.delivery) return 'message_deliveries';
  if (event.reaction) return 'message_reactions';
  if (event.optin) return 'messaging_optins';
  if (event.referral) return 'messaging_referrals';
  if (event.message_edit) return 'message_edits';
  if (event.account_linking) return 'messaging_account_linking';
  return 'unknown';
}

function handleMessagingEvent(event, channel) {
  const psid = event.sender?.id ?? event.sender?.user_ref;
  const type = eventType(event);

  switch (type) {
    case 'messages': {
      const msg = event.message;
      if (msg.admin_text && !msg.mid) {
        console.log(`Handoff notice (${msg.handoff_reason || 'no reason'}) for ${psid}`);
      } else if (msg.quick_reply) {
        console.log(`Quick reply ${msg.quick_reply.payload} from ${psid}`);
      } else {
        const kind = msg.text ? 'text' : (msg.attachments || []).map((a) => a.type).join(',');
        console.log(`Message ${msg.mid} from ${psid} (${kind})`);
      }
      // TODO: Reply via the Send API. Respond 200 first: Meta expects it within 5s.
      break;
    }
    case 'message_echoes':
      console.log(`Echo of ${event.message.mid} sent by app ${event.message.app_id} to ${event.recipient?.id}`);
      break;
    case 'messaging_postbacks':
      // In the standby channel postbacks arrive without a payload.
      console.log(`Postback "${event.postback.title}" (${event.postback.payload}) from ${psid}`);
      break;
    case 'message_reads':
      console.log(`${psid} read messages up to ${event.read.watermark}`);
      break;
    case 'message_deliveries':
      console.log(`Delivered up to ${event.delivery.watermark} (${(event.delivery.mids || []).length} mids)`);
      break;
    case 'message_reactions':
      console.log(`Reaction ${event.reaction.action} ${event.reaction.reaction || ''} on ${event.reaction.mid}`);
      break;
    case 'messaging_optins':
      console.log(`Opt-in ${event.optin.type || 'plugin'} from ${psid}`);
      // TODO: Store optin.notification_messages_token for Marketing Messages.
      break;
    case 'messaging_referrals':
      console.log(`Referral ref=${event.referral.ref} source=${event.referral.source} from ${psid}`);
      break;
    case 'message_edits':
      console.log(`Message ${event.message_edit.mid} edited (${event.message_edit.num_edit} edits)`);
      break;
    case 'messaging_account_linking':
      console.log(`Account ${event.account_linking.status} for ${psid}`);
      break;
    default:
      console.log(`Unhandled Messenger ${channel} event: ${Object.keys(event).join(',')}`);
  }
}

/** Dispatch a notification: { object: 'page', entry: [{ messaging: [...] }] }. */
function handleNotification(notification) {
  if (notification.object !== 'page') {
    // Instagram messaging arrives as object "instagram": see instagram-webhooks.
    console.log(`Ignoring object: ${notification.object}`);
    return;
  }

  for (const entry of notification.entry || []) {
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
app.get('/webhooks/messenger', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && verifyTokenMatches(token, process.env.MESSENGER_VERIFY_TOKEN)) {
    // Echo the challenge back verbatim as plain text.
    return res.status(200).type('text/plain').send(String(challenge ?? ''));
  }

  return res.status(403).send('Forbidden');
});

// POST event delivery: the raw body is needed for signature verification.
// '*/*' makes sure every content type reaches the verifier as a Buffer.
app.post('/webhooks/messenger', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyMessengerSignature(rawBody, signature, process.env.MESSENGER_APP_SECRET)) {
    console.error('Webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after verification.
  let notification;
  try {
    notification = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!notification || typeof notification !== 'object' || Array.isArray(notification)) {
    return res.status(400).send('Invalid payload');
  }

  handleNotification(notification);

  return res.status(200).send('EVENT_RECEIVED');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyMessengerSignature, eventType };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/messenger`);
  });
}
