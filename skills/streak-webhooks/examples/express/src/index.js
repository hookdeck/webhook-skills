// Generated with: streak-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the token's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Streak does not sign payloads. If the webhook was created with a `token`, Streak
 * sends it as plain text in the X-Streak-Webhook-Token header; compare the WHOLE value.
 * A webhook created without a token sends nothing to verify.
 */
function verifyStreakRequest(headers, token = process.env.STREAK_WEBHOOK_TOKEN) {
  if (!token) return false; // never accept when unconfigured
  const received = headers['x-streak-webhook-token'];
  return Boolean(received) && safeEqual(received, token);
}

// Streak does not put the event name in the body, so register one URL per webhook:
// POST /webhooks/streak?event=BOX_CREATE
function handleEvent(event, objects) {
  switch (event) {
    case 'BOX_CREATE':
      console.log(`Box created (${objects.length})`);
      // TODO: sync the new box (name, pipelineKey, stageKey)
      break;

    case 'BOX_EDIT':
      console.log(`Box edited (${objects.length})`);
      // TODO: refresh custom fields, notes, assignees or name
      break;

    case 'BOX_CHANGE_STAGE':
      console.log(`Box changed stage (${objects.length})`);
      // TODO: react to the new stageKey
      break;

    case 'BOX_CHANGE_PIPELINE':
      console.log(`Box changed pipeline (${objects.length})`);
      break;

    case 'BOX_DELETE':
      console.log(`Box deleted (${objects.length})`);
      // TODO: remove the box from your system
      break;

    case 'BOX_NEW_EMAIL_ADDRESS':
      console.log(`Box got a new email address (${objects.length})`);
      break;

    case 'STAGE_CREATE':
      console.log(`Stage created (${objects.length})`);
      break;

    case 'COMMENT_CREATE':
      console.log(`Comment created (${objects.length})`);
      // TODO: mirror the comment
      break;

    case 'MEETING_CREATE':
    case 'MEETING_UPDATE':
      console.log(`${event} (${objects.length})`);
      // TODO: sync the meeting note or call log
      break;

    case 'TASK_CREATE':
    case 'TASK_COMPLETE':
    case 'TASK_DUE':
    case 'TASK_UPDATED':
      console.log(`${event} (${objects.length})`);
      // TODO: sync the task
      break;

    case 'CONTACT_CREATE':
    case 'CONTACT_UPDATE':
    case 'CONTACT_DELETE':
    case 'ORG_CREATE':
    case 'ORG_UPDATE':
    case 'ORG_DELETE':
      console.log(`${event} (${objects.length})`);
      // TODO: sync the contact or organization
      break;

    default:
      console.log(`Unhandled event: ${event || '(none, add ?event=NAME to the webhook URL)'}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/streak', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyStreakRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing X-Streak-Webhook-Token' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // Streak sends the updated object(s) in an array; tolerate a single object too.
  const objects = Array.isArray(payload) ? payload : [payload];
  if (!objects.every((o) => o && typeof o === 'object' && !Array.isArray(o))) {
    return res.status(400).json({ error: 'Expected a JSON object or array of objects' });
  }

  try {
    handleEvent(req.query.event, objects);
  } catch (err) {
    console.error('Error handling Streak event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Must be 200. 410 Gone deletes the webhook; anything else is retried with backoff.
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyStreakRequest = verifyStreakRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/streak?event=BOX_CREATE`);
  });
}
