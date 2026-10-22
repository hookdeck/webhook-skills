// Generated with: socure-webhooks skill
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
 * Parse 'Authorization: Basic base64(username:password)'. The scheme is
 * case-insensitive and the credentials split on the FIRST colon (passwords may
 * contain colons). Returns null for a missing or malformed header.
 */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx < 0) return null;
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

/**
 * Socure RiskOS does not sign payloads. It sends the Basic credentials configured on the
 * webhook with every request. Compare username and password each in constant time and
 * evaluate both before deciding (no short-circuit).
 */
function verifySocureRequest(
  headers,
  username = process.env.SOCURE_WEBHOOK_USERNAME,
  password = process.env.SOCURE_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, username);
  const passOk = safeEqual(creds.password, password);
  return userOk && passOk;
}

function handleEvent(payload) {
  const { event_id, event_type, data } = payload;

  switch (event_type) {
    case 'evaluation_completed':
      console.log(`Evaluation completed: ${data?.eval_id} decision=${data?.decision}`);
      // TODO: act on data.decision (ACCEPT / REVIEW / REJECT)
      break;

    case 'evaluation_paused':
      console.log(`Evaluation paused: ${data?.eval_id}`);
      // TODO: send the user to step-up (DocV, OTP) and resume the evaluation
      break;

    case 'reevaluation':
      console.log(`Case reevaluated: ${data?.eval_id}`);
      // TODO: refresh the stored decision
      break;

    case 'workflow_execution_failed':
      console.log(`Workflow execution failed: ${data?.eval_id}`);
      // TODO: alert and retry the evaluation
      break;

    case 'decision_update':
      console.log(`Decision updated: ${data?.eval_id}`);
      // TODO: sync the reviewer's new decision
      break;

    case 'fraud_confirming':
      console.log(`Fraud status confirmed: ${data?.eval_id}`);
      // TODO: record the fraud / non-fraud label
      break;

    case 'review_case_assigned':
      console.log(`Case assigned: ${data?.id}`);
      // TODO: notify the reviewer
      break;

    case 'review_case_unassigned':
      console.log(`Case unassigned: ${data?.id}`);
      // TODO: return the case to the queue
      break;

    case 'case_status_updated':
      console.log(`Case status updated: ${data?.id}`);
      // TODO: sync the case status and sub-status
      break;

    case 'case_notes_added':
      console.log(`Case notes added: ${data?.id}`);
      // TODO: sync the notes
      break;

    case 'case_attachment_added':
      console.log(`Case attachment added: ${data?.id}`);
      // TODO: sync the attachments
      break;

    case 'watchlist_notification_monitored_search_updated':
      console.log(`Watchlist monitoring updated: ${data?.id}`);
      // TODO: review the monitored entity
      break;

    case 'case_management_notification_case_closure':
      console.log(`Watchlist case closed: ${data?.id}`);
      // TODO: close the matching case
      break;

    default:
      console.log(`Unhandled event: ${event_type} (${event_id})`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/socure', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifySocureRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
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
    console.error('Error handling Socure event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifySocureRequest = verifySocureRequest;
module.exports.parseBasicAuth = parseBasicAuth;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/socure`);
  });
}
