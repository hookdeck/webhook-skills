// Generated with: dynatrace-webhooks skill
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
 * Dynatrace does not sign payloads. Authenticate with a secret header added as an
 * "Additional HTTP header" on the webhook integration. The header name is yours to
 * choose (DYNATRACE_WEBHOOK_HEADER, default Authorization); the expected value is the
 * exact, whole header value (DYNATRACE_WEBHOOK_SECRET). No "Bearer " parsing.
 */
function verifyDynatraceRequest(
  headers,
  headerName = process.env.DYNATRACE_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.DYNATRACE_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[String(headerName).toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

// The body is a template you write, so the vendor adds no event field. This handler
// assumes the illustrative JSON template from the skill and dispatches on State.
function handleProblem(payload) {
  const { State: state, ProblemID: id, ProblemTitle: title } = payload;

  switch (state) {
    case 'OPEN':
      console.log(`Problem opened: ${id} ${title}`);
      // TODO: page on-call or open a ticket (payload.ImpactedEntity)
      break;

    default:
      // Dynatrace also notifies when a problem is resolved, but its docs show only the
      // OPEN value of {State}. Log other values and match on what a real delivery sends.
      console.log(`Problem ${id} state ${state}: ${title}`);
      // TODO: close the matching ticket once you have confirmed the resolved State value
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/dynatrace', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyDynatraceRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  // The template may produce JSON, text or XML. Only JSON objects are dispatched.
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    // not JSON
  }

  try {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      handleProblem(payload);
    } else {
      console.log(`Received non-JSON notification (${raw.length} bytes)`);
    }
  } catch (err) {
    console.error('Error handling Dynatrace notification:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyDynatraceRequest = verifyDynatraceRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/dynatrace`);
  });
}
