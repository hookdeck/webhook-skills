// Generated with: incode-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

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
 * Incode does not sign payloads. You add a custom header in Dashboard >
 * Configuration > Webhooks and Incode sends it on every webhook. The header name is
 * yours to choose, so it comes from INCODE_WEBHOOK_HEADER (default Authorization).
 * The WHOLE header value is compared with INCODE_WEBHOOK_SECRET: no prefix is
 * stripped or parsed (a "Bearer " you typed into the value is part of the value).
 */
function verifyIncodeRequest(
  headers,
  secret = process.env.INCODE_WEBHOOK_SECRET,
  headerName = process.env.INCODE_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

// Each webhook kind carries its name in a different field.
function eventName(payload) {
  return payload.event_type || payload.eventType || payload.onboardingStatus;
}

function handleEvent(payload) {
  const event = eventName(payload);

  switch (event) {
    // Session webhooks (event_type)
    case 'SESSION_STARTED':
      console.log(`Session started: ${payload.interviewId}`);
      // TODO: mark the applicant as in progress
      break;

    case 'SESSION_PROGRESS':
      console.log(`Session progress: ${payload.interviewId}`);
      // TODO: track resumed sessions
      break;

    case 'SESSION_SUCCEEDED':
      console.log(`Session succeeded: ${payload.interviewId} (identity ${payload.identityId})`);
      // TODO: approve the applicant, fetch results with the Incode API
      break;

    case 'SESSION_FAILED':
      console.log(`Session failed: ${payload.interviewId} (${(payload.failureReasons || []).join(', ')})`);
      // TODO: reject or retry the applicant (payload.failureReasons)
      break;

    case 'SESSION_PENDING_REVIEW':
      console.log(`Session pending review: ${payload.interviewId}`);
      // TODO: queue for manual review
      break;

    // Identity Enrolled (eventType)
    case 'IDENTITY_ENROLLED':
      console.log(`Identity enrolled: ${payload.identityId}`);
      // TODO: link payload.identityId to your user record
      break;

    // Onboarding status webhook (onboardingStatus)
    case 'ID_VALIDATION_FINISHED':
    case 'ID_VALIDATION_FINISHED_SECOND_ID':
    case 'GOVERNMENT_VALIDATION_FINISHED':
    case 'FACE_VALIDATION_FINISHED':
    case 'POST_PROCESSING_FINISHED':
    case 'POST_PROCESSING_FINISHED_SECOND_ID':
      console.log(`Onboarding step finished: ${event} (${payload.interviewId})`);
      // TODO: optionally fetch partial results; wait for ONBOARDING_FINISHED for final data
      break;

    case 'ONBOARDING_FINISHED':
      console.log(`Onboarding finished: ${payload.interviewId}`);
      // TODO: fetch the final session results
      break;

    case 'MANUAL_REVIEW_APPROVED':
      console.log(`Manual review approved: ${payload.interviewId}`);
      // TODO: approve the applicant
      break;

    case 'MANUAL_REVIEW_REJECTED':
      console.log(`Manual review rejected: ${payload.interviewId}`);
      // TODO: reject the applicant
      break;

    case 'EXPIRED':
      console.log(`Session expired: ${payload.interviewId}`);
      // TODO: expire the pending applicant
      break;

    case 'DELETED':
      console.log(`Sessions deleted: ${(payload.interviewIds || []).join(', ')}`);
      // TODO: delete your copies of these sessions (note interviewIds, not interviewId)
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/incode', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyIncodeRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
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
    console.error('Error handling Incode event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Incode retries unless it gets 200 with a JSON content type, or 204.
  res.status(200).json({ success: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyIncodeRequest = verifyIncodeRequest;
module.exports.eventName = eventName;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/incode`);
  });
}
