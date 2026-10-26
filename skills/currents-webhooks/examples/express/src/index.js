// Generated with: currents-webhooks skill
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
 * Currents does not sign payloads. You add a secret custom header to the HTTP
 * Webhook integration; the header name is yours, so it comes from
 * CURRENTS_WEBHOOK_HEADER (default Authorization). The WHOLE header value is
 * compared with CURRENTS_WEBHOOK_SECRET: no "Bearer " parsing.
 *
 * A static credential authenticates the sender, not the body, and gives no replay
 * protection. The unsigned x-timestamp header can be forged, so it is not checked.
 */
function verifyCurrentsRequest(
  headers,
  secret = process.env.CURRENTS_WEBHOOK_SECRET,
  headerName = process.env.CURRENTS_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { event, runUrl, buildId, groupId } = payload;

  switch (event) {
    case 'RUN_START':
      console.log(`Run started: ${buildId} ${runUrl}`);
      // TODO: post a "tests running" status
      break;

    case 'RUN_FINISH':
      console.log(`Run finished: ${buildId}${groupId ? ` (${groupId})` : ''} ${runUrl}`);
      // TODO: notify a channel or update a PR (payload.passes, payload.failures, payload.flaky)
      break;

    case 'RUN_TIMEOUT':
      console.log(`Run timed out: ${buildId} ${runUrl}`);
      // TODO: alert on the stuck CI job
      break;

    case 'RUN_CANCELED':
      console.log(`Run canceled: ${buildId} ${runUrl}`);
      // TODO: clear the pending status (counters are a snapshot)
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/currents', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyCurrentsRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
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
    console.error('Error handling Currents event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyCurrentsRequest = verifyCurrentsRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/currents`);
  });
}
