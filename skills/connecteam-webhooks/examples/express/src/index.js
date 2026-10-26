// Generated with: connecteam-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Connecteam's docs don't name the method (the Chat guide says POST), so accept all of these.
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Connecteam does not sign or hash the body. When a secretKey is set on the webhook,
 * it is sent as-is in the x-webhook-secret header. Compare the WHOLE header value.
 * This authenticates the sender only: it says nothing about the body and gives no
 * replay protection.
 */
function verifyConnecteamRequest(headers, secret = process.env.CONNECTEAM_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers['x-webhook-secret']; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { eventType } = payload;

  switch (eventType) {
    // Users
    case 'user_created':
    case 'user_updated':
    case 'user_deleted':
    case 'user_archived':
    case 'user_restored':
    case 'user_promoted':
    case 'user_demoted':
      console.log(`User event ${eventType}:`, JSON.stringify(payload.data));
      // TODO: sync payload.data[] (userId, email, isArchived) to your directory
      break;

    // Forms
    case 'form_submission':
    case 'form_submission_edited':
    case 'manager_field_updated':
      console.log(`Form event ${eventType}: submission ${payload.data?.formSubmissionId}`);
      // TODO: process payload.data.answers
      break;

    // Time clock (flat payload: userId, timeClockId at the root)
    case 'clock_in':
    case 'clock_out':
    case 'auto_clock_out':
    case 'admin_add':
    case 'admin_edit':
    case 'admin_delete':
    case 'user_timesheet_submitted':
    case 'user_timesheet_unsubmitted':
    case 'user_timesheet_approved':
    case 'user_timesheet_reopened':
      console.log(`Time activity event ${eventType}: user ${payload.userId}, clock ${payload.timeClockId}`);
      // TODO: update payroll or attendance records
      break;

    // Shift scheduler
    case 'shift_created':
    case 'shift_updated':
    case 'shift_deleted':
    case 'availability_status_created':
    case 'availability_status_deleted':
      console.log(`Scheduler event ${eventType}: scheduler ${payload.schedulerId}`);
      // TODO: sync payload.data to your calendar
      break;

    // Tasks
    case 'task_published':
    case 'task_completed':
      console.log(`Task event ${eventType}`);
      // TODO: update your task tracker from payload.data
      break;

    // Chat
    case 'message_created':
    case 'message_updated':
    case 'message_deleted':
    case 'conversation_created':
    case 'conversation_updated':
    case 'conversation_deleted':
      console.log(`Chat event ${eventType}`);
      // TODO: mirror payload.data
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

function handleWebhook(req, res) {
  // Check the credential first, for every method, before looking at the body.
  if (!verifyConnecteamRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing x-webhook-secret' });
  }

  // express.raw leaves req.body undefined or empty when there is no body.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (raw.trim() === '') {
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Connecteam event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

// Read the body raw (any content type) and authenticate before parsing it.
for (const method of METHODS) {
  app[method]('/webhooks/connecteam', express.raw({ type: '*/*' }), handleWebhook);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyConnecteamRequest = verifyConnecteamRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/connecteam`);
  });
}
