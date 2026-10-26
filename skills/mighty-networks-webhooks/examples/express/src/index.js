// Generated with: mighty-networks-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest();
const hasBearer = (v) => typeof v === 'string' && /^bearer /i.test(v);

/**
 * Mighty Networks does not sign payloads. It sends the API key you configured with the
 * webhook as "Authorization: Bearer <key>". The scheme matches in any case (RFC 9110); the key
 * is compared exactly, in constant time. Hashing both sides gives equal-length buffers, so
 * timingSafeEqual never throws.
 *
 * MIGHTY_NETWORKS_WEBHOOK_SECRET holds the bare key. If it starts with "Bearer " it is stripped.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
function verifyMightyNetworksRequest(headers, secret = process.env.MIGHTY_NETWORKS_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const expected = hasBearer(secret) ? secret.slice(7) : secret;
  if (!expected) return false; // a configured value of just "Bearer " must not match
  const auth = headers['authorization'];
  if (!expected || !hasBearer(auth)) return false;
  return crypto.timingSafeEqual(sha256(auth.slice(7)), sha256(expected));
}

// event_type arrives as "PostCreatedHook"; the docs name the event "PostCreated".
function normalizeEventType(eventType) {
  return typeof eventType === 'string' ? eventType.replace(/Hook$/, '') : '';
}

// Retries redeliver the same event_id. Use a durable store (Redis, a DB unique key) in production.
const seenEventIds = new Set();

function handleEvent(eventType, payload) {
  switch (eventType) {
    case 'MemberJoined':
      console.log(`Member joined space ${payload.space_id}`);
      // TODO: welcome the member, sync to your CRM (payload.member)
      break;

    case 'MemberLeft':
      console.log(`Member left space ${payload.space_id}`);
      // TODO: record churn (payload.member, payload.reason)
      break;

    case 'MemberPurchased':
      console.log('Member purchased a plan');
      // TODO: grant access (payload.member, payload.plan, payload.purchase)
      break;

    case 'MemberPurchaseRequested':
      console.log('Member requested a purchase');
      // TODO: approve or follow up (payload.member_email, payload.plan_id)
      break;

    case 'MemberSubscriptionRenewed':
      console.log('Subscription renewed');
      // TODO: extend access (payload.member, payload.subscription)
      break;

    case 'MemberSubscriptionCanceled':
      console.log('Subscription canceled');
      // TODO: start a win-back flow (payload.member, payload.subscription)
      break;

    case 'MemberPlanChanged':
      console.log('Member changed plan');
      // TODO: adjust entitlements (payload.plan)
      break;

    case 'MemberRemovedFromPlan':
      console.log('Member removed from plan');
      // TODO: revoke access
      break;

    case 'PostCreated':
      console.log(`Post created: ${payload.title}`);
      // TODO: moderate or cross-post (payload.id, payload.space_id)
      break;

    case 'PostUpdated':
      console.log(`Post updated: ${payload.title}`);
      // TODO: re-sync the post
      break;

    case 'CommentCreated':
      console.log(`Comment created on ${payload.targetable_type} ${payload.targetable_id}`);
      // TODO: notify (payload.text, payload.author_id)
      break;

    case 'RsvpCreated':
      console.log(`RSVP created: ${payload.status}`);
      // TODO: update the attendee list (payload.event, payload.member)
      break;

    case 'EventCreated':
      console.log(`Event created: ${payload.title}`);
      // TODO: add to your calendar (payload.starts_at)
      break;

    case 'EventCanceled':
      console.log(`Event canceled: ${payload.title}`);
      // TODO: notify attendees
      break;

    case 'ReportedContentCreated':
      console.log('Content reported');
      // TODO: queue for moderation (payload.reported_content)
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/mighty-networks', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyMightyNetworksRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization Bearer key' });
  }

  let body;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    body = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  const { event_id: eventId, payload } = body;
  if (eventId && seenEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(normalizeEventType(body.event_type), payload && typeof payload === 'object' ? payload : {});
  } catch (err) {
    console.error('Error handling Mighty Networks event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (eventId) seenEventIds.add(eventId); // after success, so a failed event is retried
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyMightyNetworksRequest = verifyMightyNetworksRequest;
module.exports.normalizeEventType = normalizeEventType;
module.exports.seenEventIds = seenEventIds;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/mighty-networks`);
  });
}
