// Generated with: surveymonkey-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// SurveyMonkey callbacks are POSTs with two headers:
//   Sm-Apikey     your app's client ID (or API key, for old-auth apps)
//   Sm-Signature  base64 HMAC-SHA1 of the raw body
// The HMAC key is the literal string "<client ID>&<client secret>"
// ("<API key>&<API secret>" for old-auth apps).
// SurveyMonkey also sends a HEAD request to the URL when a webhook is created
// or replaced, and the URL must answer 200 (unless the API call passes
// bypass_ping=true).
// ---------------------------------------------------------------------------

/**
 * Verify Sm-Signature against the exact bytes SurveyMonkey sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - Sm-Signature
 * @param {string|undefined} clientId - SURVEYMONKEY_CLIENT_ID (or API key)
 * @param {string|undefined} clientSecret - SURVEYMONKEY_CLIENT_SECRET
 * @returns {boolean}
 */
function verifySurveyMonkeySignature(rawBody, signature, clientId, clientSecret) {
  const id = String(clientId || '').trim();
  const secret = String(clientSecret || '').trim();
  const value = String(signature || '').trim();
  // SHA-1 is 20 bytes: 28 base64 characters with one '='.
  if (!id || !secret || !/^[A-Za-z0-9+/]{27}=$/.test(value)) return false;
  const expected = crypto.createHmac('sha1', `${id}&${secret}`).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'base64'), expected);
}

/**
 * The body names the event and the IDs involved. It doesn't include the
 * response itself: fetch it from the API with the IDs in resources.
 */
function handleEvent(event) {
  const resources = event.resources || {};
  switch (event.event_type) {
    case 'response_completed':
      console.log(`Response ${event.object_id} completed for survey ${resources.survey_id}`);
      break;
    case 'response_updated':
    case 'response_created':
    case 'response_disqualified':
    case 'response_overquota':
    case 'response_deleted':
      console.log(`${event.event_type}: response ${event.object_id}`);
      break;
    case 'survey_created':
    case 'survey_updated':
    case 'survey_deleted':
      console.log(`${event.event_type}: survey ${event.object_id}`);
      break;
    case 'collector_created':
    case 'collector_updated':
    case 'collector_deleted':
      console.log(`${event.event_type}: collector ${event.object_id}`);
      break;
    case 'app_installed':
    case 'app_uninstalled':
      console.log(`${event.event_type} by user ${resources.user_id}`);
      break;
    default:
      console.log(`Unhandled SurveyMonkey event: ${event.event_type}`);
  }
  return { received: true, event_type: event.event_type, event_id: event.event_id };
}

// SurveyMonkey checks the URL with a HEAD request when the webhook is created
// or replaced. It carries no signature: answer 200 and do nothing else.
app.head('/webhooks/surveymonkey', (req, res) => {
  res.status(200).end();
});

// express.raw() keeps the exact bytes for the HMAC. The Content-Type is
// application/vnd.surveymonkey.<object>.v1+json, which express.json() would skip.
app.post('/webhooks/surveymonkey', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const clientId = process.env.SURVEYMONKEY_CLIENT_ID;
  const clientSecret = process.env.SURVEYMONKEY_CLIENT_SECRET;
  if (!clientId || !clientId.trim() || !clientSecret || !clientSecret.trim()) {
    console.error('SURVEYMONKEY_CLIENT_ID and SURVEYMONKEY_CLIENT_SECRET must both be set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySurveyMonkeySignature(rawBody, req.get('sm-signature'), clientId, clientSecret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  return res.status(200).json(handleEvent(event));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SurveyMonkey webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/surveymonkey`);
  });
}

module.exports = { app, verifySurveyMonkeySignature, handleEvent };
