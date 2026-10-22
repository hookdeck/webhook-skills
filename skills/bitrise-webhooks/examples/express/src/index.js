// Generated with: bitrise-webhooks skill
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
 * Bitrise does not sign payloads. Authenticate with a secret custom header added to the
 * outgoing webhook's Headers section. The header name is user-chosen; the expected value is
 * the exact, whole header value (a 'Bearer ' prefix, if you typed one, is part of it).
 * This is a static shared credential: it authenticates the sender, not the body, and gives
 * no replay protection.
 */
function verifyBitriseRequest(
  headers,
  secret = process.env.BITRISE_WEBHOOK_SECRET,
  headerName = process.env.BITRISE_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

/**
 * Release Management bodies have a string trigger_event. CI build event bodies document no
 * type field, so they are detected by shape.
 */
function detectKind(payload) {
  if (typeof payload.trigger_event === 'string') return 'release_management';
  if ('build_status' in payload || 'build_triggered_workflow' in payload || 'build_slug' in payload) {
    return 'ci_build';
  }
  return 'unknown';
}

function handleReleaseEvent(payload) {
  const { trigger_event: event, release_id: releaseId } = payload;

  switch (event) {
    case 'app_version_added':
      console.log(`App version added to release ${releaseId}`);
      // TODO: record the new version (payload.description)
      break;

    case 'testflight_upload_started':
      console.log(`TestFlight upload started: ${payload.file_name}`);
      break;

    case 'testflight_upload_completed':
      console.log(`TestFlight upload completed: ${payload.file_name} ${payload.version} (${payload.version_code})`);
      // TODO: notify QA that the build is uploaded
      break;

    case 'testflight_upload_failed':
      console.log(`TestFlight upload failed: ${payload.file_name}`);
      // TODO: alert the release owner
      break;

    case 'testflight_processing_completed':
      console.log(`TestFlight processing completed: ${payload.file_name}`);
      // TODO: announce the build to testers
      break;

    case 'testflight_processing_failed':
      console.log(`TestFlight processing failed: ${payload.file_name}`);
      // TODO: alert the release owner
      break;

    case 'testflight_app_review_approved':
      console.log(`TestFlight app review approved: ${payload.testflight_beta_build_id}`);
      break;

    case 'testflight_app_review_rejected':
      console.log(`TestFlight app review rejected: ${payload.testflight_beta_build_id}`);
      // TODO: alert the release owner
      break;

    case 'google_play_upload_completed':
      console.log(`Google Play upload completed: ${payload.file_name} ${payload.version} (${payload.version_code})`);
      // TODO: notify QA that the build is uploaded
      break;

    case 'google_play_upload_failed':
      console.log(`Google Play upload failed: ${payload.file_name}`);
      // TODO: alert the release owner
      break;

    case 'app_store_review_approved':
      console.log(`App Store review approved: ${payload.version}`);
      break;

    case 'app_store_review_rejected':
      console.log(`App Store review rejected: ${payload.version} (${payload.reason})`);
      // TODO: alert the release owner
      break;

    case 'app_store_release_completed':
      console.log(`App Store release completed for release ${releaseId}`);
      // TODO: announce the release
      break;

    case 'google_play_release_completed':
      console.log(`Google Play release completed for release ${releaseId}`);
      // TODO: announce the release
      break;

    default:
      console.log(`Unhandled Release Management event: ${event}`);
  }
}

function handleCiBuildEvent(payload) {
  const { build_slug: slug, build_status: status, build_triggered_workflow: workflow } = payload;
  console.log(`CI build event: build ${slug} workflow ${workflow} status ${status}`);
  // TODO: report build status or trigger a downstream job
}

function handleEvent(payload) {
  switch (detectKind(payload)) {
    case 'release_management':
      return handleReleaseEvent(payload);
    case 'ci_build':
      return handleCiBuildEvent(payload);
    default:
      console.log('Unhandled Bitrise payload');
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/bitrise', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyBitriseRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
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
    console.error('Error handling Bitrise event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyBitriseRequest = verifyBitriseRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bitrise`);
  });
}
