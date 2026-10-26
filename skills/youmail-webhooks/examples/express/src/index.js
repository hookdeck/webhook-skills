// Generated with: youmail-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * YouMail does not sign payloads. When the webhook is created with auth "Bearer",
 * YouMail is expected to send `Authorization: Bearer <token>` (not printed in its docs). Compare the WHOLE header value,
 * including the "Bearer " prefix, with YOUMAIL_AUTHORIZATION. Don't strip or parse it.
 * A static credential authenticates the sender only: it does not cover the body and
 * gives no replay protection.
 */
function verifyYouMailRequest(headers, config = process.env) {
  const expected = config.YOUMAIL_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * YouMail payloads have no envelope and no type field: each webhook is created for
 * one eventType. Prefer one URL per webhook; otherwise detect by top-level keys.
 */
function classify(payload) {
  const has = (k) => Object.prototype.hasOwnProperty.call(payload, k);
  if (has('callEvents')) return 'CALL_EVENT';
  if (
    ['callAttestationSummaries', 'callCompletionSummaries', 'callLabelSummaries', 'callVolumeSummaries'].some(has)
  ) {
    return 'PHONE_INSIGHTS';
  }
  if (has('tnReportUuid')) return 'PROVIDER_TN_REPORT_STATUS';
  // WATCHLIST_PHONE_SCORE_THRESHOLD (deprecated, no longer emitted) shares this shape
  if (has('phoneNumber') && ['oldSpamScore', 'newSpamScore', 'newFraudScore', 'newUnlawfulScore'].some(has)) {
    return 'WATCHLIST_SCORE_THRESHOLD';
  }
  return null;
}

function handleEvent(payload) {
  switch (classify(payload)) {
    case 'CALL_EVENT':
      console.log(`Call events: ${Array.isArray(payload.callEvents) ? payload.callEvents.length : 1}`);
      // TODO: store the call events (callEventUuid, callResult, originator, destination)
      break;

    case 'PHONE_INSIGHTS':
      console.log('Phone insights summaries received');
      // TODO: process the *Summaries arrays
      break;

    case 'PROVIDER_TN_REPORT_STATUS':
      console.log(`TN report ${payload.tnReportUuid} (${payload.phoneNumber}): ${payload.status}`);
      // TODO: update the TN report status in your system
      break;

    case 'WATCHLIST_SCORE_THRESHOLD':
      console.log(
        `Score threshold for ${payload.phoneNumber}: spam ${payload.oldSpamScore} -> ${payload.newSpamScore}`
      );
      // TODO: alert on the changed spam, unlawful or fraud scores
      break;

    default:
      console.log('Unhandled YouMail payload (unrecognized top-level keys)');
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type YouMail uses.
app.post('/webhooks/youmail', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyYouMailRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
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
    console.error('Error handling YouMail webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyYouMailRequest = verifyYouMailRequest;
module.exports.classify = classify;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/youmail`);
  });
}
