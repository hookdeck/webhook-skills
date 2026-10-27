// Generated with: learnupon-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * LearnUpon signs the raw body with HMAC-SHA256 and sends the bare hex digest in
 * X-Webhook-Signature. Nothing else is signed (no timestamp), so there is no replay window.
 * The format is validated (exactly 64 hex characters) before it is decoded, because
 * Buffer.from(x, 'hex') silently drops invalid characters.
 */
function verifyLearnuponSignature(rawBody, signature, secret = process.env.LEARNUPON_WEBHOOK_SECRET) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false; // never accept when unconfigured
  if (typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // 32 bytes after validation
  return crypto.timingSafeEqual(expected, received);
}

// Demo dedupe store. Use a durable store (Redis, DB unique key) in production.
const seenWebhookIds = new Set();

function handleEvent(type, item) {
  switch (type) {
    case 'user_created':
      console.log(`User created: ${item.user?.userId} (${item.user?.email})`);
      // TODO: provision the user in your system
      break;

    case 'user_updated':
      console.log(`User updated: ${item.user?.userId}`);
      // TODO: sync the profile
      break;

    case 'course_cloning_complete':
    case 'course_updated':
      console.log(`Course event: ${type}`);
      // TODO: refresh your course catalog
      break;

    case 'course_completion':
      console.log(`Course completed: course ${item.courseId} by user ${item.user?.userId} (${item.enrollmentStatus})`);
      // TODO: issue a certificate or update HR records
      break;

    case 'module_complete':
      console.log(`Module completed: ${type}`);
      // TODO: track progress
      break;

    case 'purchase_completion':
      console.log(`Purchase completed: order ${item.orderId} (${item.amountPaid} ${item.currency})`);
      // TODO: fulfil the order
      break;

    case 'badge_awarded':
    case 'badge_revoked':
      console.log(`Badge event: ${type}`);
      // TODO: update recognition feeds
      break;

    case 'course_enrollment':
      console.log(`Course enrollment: user ${item.user?.userId} on course ${item.courseId}`);
      // TODO: sync the roster
      break;

    case 'course_unenrollment':
      console.log(`Course unenrollment: user ${item.user?.userId} from course ${item.courseId}`);
      // TODO: remove from the roster
      break;

    case 'learning_path_enrollment':
    case 'learning_path_updated':
    case 'learning_path_completion':
      console.log(`Learning path event: ${type}`);
      // TODO: sync learning path state
      break;

    case 'event_session_creation':
    case 'event_session_updated':
    case 'event_session_canceled':
      console.log(`Live-learning session event: ${type} (session ${item.sessionId})`);
      // TODO: sync your calendar
      break;

    case 'learning_journey_enrollment':
    case 'learning_journey_completion':
    case 'learning_journey_blocked':
    case 'learning_journey_deleted':
    case 'learning_journey_archived':
      console.log(`Learning journey event: ${type}`);
      // TODO: sync learning journey state
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

// Read the body raw (any content type); verify before parsing it.
app.post('/webhooks/learnupon', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyLearnuponSignature(req.body, req.get('X-Webhook-Signature'))) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const type = req.get('X-Webhook-Type');
  if (!type || !payload || !Array.isArray(payload.data)) {
    return res.status(400).json({ error: 'Expected {"data": [...]} and an X-Webhook-Type header' });
  }

  // LearnUpon resends failed webhooks, so dedupe on X-Webhook-ID.
  const webhookId = req.get('X-Webhook-ID');
  if (webhookId && seenWebhookIds.has(webhookId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Up to 10 events of one type per request.
    for (const item of payload.data) handleEvent(type, item || {});
  } catch (err) {
    console.error('Error handling LearnUpon webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (webhookId) seenWebhookIds.add(webhookId);
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyLearnuponSignature = verifyLearnuponSignature;
module.exports.seenWebhookIds = seenWebhookIds;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/learnupon`);
  });
}
