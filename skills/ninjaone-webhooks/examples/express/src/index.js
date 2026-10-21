// Generated with: ninjaone-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// NinjaOne does NOT sign webhooks: there is no signature header and no HMAC.
// Authentication is the custom header you set when configuring the webhook via the API
// (PUT /v2/webhook, "headers": [{ "name": "X-Webhook-Secret", "value": "<secret>" }]).
function verifyNinjaOneSecret(headerValue, secret) {
  if (!secret) return false; // fail closed when NINJAONE_WEBHOOK_SECRET is unset
  if (typeof headerValue !== 'string') return false;
  // Hash both sides so timingSafeEqual always gets equal-length buffers
  const a = crypto.createHash('sha256').update(headerValue).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

// Use a database or cache in production; a Set is enough to show the idea.
const processed = new Set();

// An activity is identified by activityType + statusCode (e.g. CONDITION + TRIGGERED).
function handleActivity(activity) {
  const { activityType, statusCode } = activity;
  switch (activityType) {
    case 'CONDITION':
      // A monitoring condition fired (TRIGGERED) or cleared (RESET)
      if (statusCode === 'TRIGGERED') {
        console.log(
          `Condition triggered on device ${activity.deviceId}: ${activity.message} (severity ${activity.severity})`
        );
      } else if (statusCode === 'RESET') {
        console.log(`Condition reset on device ${activity.deviceId}: ${activity.message}`);
      } else {
        console.log(`Condition ${statusCode} on device ${activity.deviceId}`);
      }
      break;
    case 'ACTION':
    case 'ACTIONSET':
      // Scripts and automations: STARTED, COMPLETED, CANCELLED, ...
      console.log(`${activityType} ${statusCode} on device ${activity.deviceId}: ${activity.subject}`);
      break;
    default:
      console.log(`Unhandled activity ${activityType}/${statusCode}`);
  }
  // TODO: open a ticket, page on-call, sync your CMDB, etc.
}

// express.raw so we authenticate before parsing and can return 400 on bad JSON
app.post('/webhooks/ninjaone', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.NINJAONE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('NINJAONE_WEBHOOK_SECRET is not set; rejecting webhook');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  if (!verifyNinjaOneSecret(req.headers['x-webhook-secret'], secret)) {
    return res.status(401).json({ error: 'Invalid or missing X-Webhook-Secret header' });
  }

  let activity;
  try {
    activity = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (!activity || typeof activity !== 'object' || Array.isArray(activity) || !activity.activityType) {
    return res.status(400).json({ error: 'Expected an activity object with activityType' });
  }

  const key = activity.id != null ? `${activity.id}:${activity.statusCode}` : null;
  if (key && processed.has(key)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleActivity(activity);
  } catch (err) {
    console.error('Error handling NinjaOne activity:', err);
    return res.status(500).json({ error: 'Processing failed' });
  }

  if (key) processed.add(key);
  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`NinjaOne webhook server listening on port ${port}`);
    console.log(`Webhook endpoint: http://localhost:${port}/webhooks/ninjaone`);
  });
}

module.exports = { app, verifyNinjaOneSecret, handleActivity, processed };
