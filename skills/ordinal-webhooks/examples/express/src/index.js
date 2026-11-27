// Generated with: ordinal-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();

// ---------------------------------------------------------------------------
// Ordinal signs every delivery per Standard Webhooks:
//   webhook-id         stable id for the event (the same on a retry)
//   webhook-timestamp  Unix seconds when the delivery was signed
//   webhook-signature  "v1,<base64 HMAC-SHA256>", space-separated when two
//                      signatures arrive during a secret rotation
//   webhook-topic      the event type; NOT covered by the signature
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the signing secret after its `whsec_` prefix. The
// secret is in the Create webhook response (`signingSecret`) and on the
// webhook's configure page in the dashboard.
// ---------------------------------------------------------------------------

/**
 * Read the three signed headers. Returns null if any is missing.
 *
 * @param {(name: string) => string | undefined} get - header getter
 */
function signatureHeaders(get) {
  const headers = {
    'webhook-id': get('webhook-id'),
    'webhook-timestamp': get('webhook-timestamp'),
    'webhook-signature': get('webhook-signature'),
  };
  return headers['webhook-id'] && headers['webhook-timestamp'] && headers['webhook-signature']
    ? headers
    : null;
}

/**
 * Verify an Ordinal delivery with the Standard Webhooks library, as Ordinal's
 * docs recommend. It recomputes the HMAC over the raw body, accepts a match on
 * any `v1,` entry, and throws if `webhook-timestamp` is more than five minutes
 * from now.
 *
 * @param {string} rawBody - the exact body Ordinal sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the webhook's whsec_ signing secret
 * @returns {object} the parsed, verified `{ type, data, createdAt }` envelope
 * @throws {Error} if verification fails
 */
function verifyOrdinalWebhook(rawBody, headers, secret = process.env.ORDINAL_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers);
}

/**
 * The single key inside `data` depends on the event family. Reading
 * `data.post` on a comment or approval event yields undefined.
 *
 * @param {string} type - the event type
 * @returns {'profile'|'post'|'comment'|'approval'|'invite'|'mention'|null}
 */
function resourceKeyFor(type) {
  if (typeof type !== 'string') return null;
  if (type.startsWith('social_profile.')) return 'profile';
  if (type.startsWith('linkedin.monitoring.mention.')) return 'mention';
  if (type.startsWith('linkedin.monitoring.comment.')) return 'comment';
  if (type === 'post.comment.created' || type === 'post.inline_comment.created') return 'comment';
  // post.approval.* and campaign.approval.* both use `data.approval`.
  if (type.includes('.approval.')) return 'approval';
  if (type.startsWith('invite.')) return 'invite';
  if (type.startsWith('post.')) return 'post';
  return null;
}

function extractResource(event) {
  const key = resourceKeyFor(event && event.type);
  const data = (event && event.data) || {};
  return key && data[key] && typeof data[key] === 'object' ? data[key] : {};
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// webhook-id is the same on every retry of an event.
const processedEventIds = new Set();

/**
 * Dispatch on the exact event type strings. Note the underscores inside
 * publish_failed, reconnect_needed, permanently_deleted and inline_comment.
 */
function handleEvent(event) {
  const r = extractResource(event);

  switch (event.type) {
    // Social profiles (data.profile)
    case 'social_profile.connected':
      console.log(`Profile connected: ${r.name} (${r.channel})`);
      break;
    case 'social_profile.disconnected':
      console.log(`Profile disconnected: ${r.name}`);
      break;
    case 'social_profile.reconnect_needed':
      // Scheduled posts on this profile will fail until someone reconnects it.
      console.log(`Profile needs reconnecting: ${r.name} (${r.channel})`);
      break;

    // Posts (data.post)
    case 'post.created':
      // `channels` is an array here; post.published has a singular `channel`.
      console.log(`Post created: ${r.title} [${(r.channels || []).join(', ')}] status=${r.status}`);
      break;
    case 'post.scheduled':
    case 'post.rescheduled':
    case 'post.unscheduled':
      console.log(`${event.type}: ${r.title}`);
      break;
    case 'post.published':
      // `postUrl` (the live link) may be null; `url` is the Ordinal app link.
      console.log(`Post published: ${r.title} -> ${r.postUrl || '(no channel URL)'}`);
      break;
    case 'post.publish_failed':
      console.log(`Publish failed: ${r.title}: ${r.error}`);
      break;
    case 'post.archived':
    case 'post.permanently_deleted':
      console.log(`${event.type}: ${r.id}`);
      break;
    case 'post.content.edited':
      // Debounced per post (about five minutes) and carries the latest content
      // for every channel. Overwrite your copy rather than applying a diff.
      console.log(`Post content edited: ${r.title}`);
      break;

    // Comments (data.comment)
    case 'post.comment.created':
    case 'post.inline_comment.created':
      console.log(`Comment on "${r.post && r.post.title}": ${r.message}`);
      break;

    // Approvals (data.approval, for posts and campaigns)
    case 'post.approval.requested':
      console.log(
        `Approval requested on "${r.post && r.post.title}" from ${(r.createdApprovals || []).length} approver(s)`
      );
      break;
    case 'post.approval.approved':
      console.log(`Post approved: ${r.post && r.post.title}`);
      break;
    case 'campaign.approval.requested':
    case 'campaign.approval.approved':
      console.log(`${event.type}: ${r.campaign && r.campaign.name}`);
      break;

    // Invites (data.invite)
    case 'invite.created':
      // An invitee who already has an account is added directly, with no email.
      console.log(`Invite created for ${r.email}`);
      break;
    case 'invite.accepted':
      console.log(`Invite accepted by ${r.email}`);
      break;

    // LinkedIn Monitoring (data.comment / data.mention)
    case 'linkedin.monitoring.comment.created':
    case 'linkedin.monitoring.comment.edited':
    case 'linkedin.monitoring.comment.deleted':
      // `profile.type` is Organization (company page) or User (personal
      // profile). `companyPage` is deprecated.
      console.log(`${event.type} on ${r.profile && r.profile.name}: ${r.commentary}`);
      break;
    case 'linkedin.monitoring.mention.created':
      console.log(`Company page mentioned: ${r.postUrl}`);
      break;

    default:
      console.log(`Unhandled Ordinal event: ${event.type}`);
  }
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would
// re-serialise the body and break verification.
app.post('/webhooks/ordinal', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.ORDINAL_WEBHOOK_SECRET) {
    console.error('ORDINAL_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = signatureHeaders((name) => req.get(name));
  if (!headers) {
    return res.status(400).json({ error: 'Missing webhook signature headers' });
  }

  let event;
  try {
    event = verifyOrdinalWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Ordinal webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const eventId = headers['webhook-id'];
  if (processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Any 2xx acknowledges the delivery. In production, enqueue the event here
    // and process it asynchronously.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Ordinal event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Ordinal webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ordinal`);
  });
}

module.exports = { app, verifyOrdinalWebhook, signatureHeaders, resourceKeyFor, extractResource };
