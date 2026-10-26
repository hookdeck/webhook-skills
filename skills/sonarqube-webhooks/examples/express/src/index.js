require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a SonarQube webhook signature.
 *
 * SonarQube sends X-Sonar-Webhook-HMAC-SHA256 = bare lowercase hex of
 * HMAC-SHA256(secret, rawBody). Only the raw body is signed.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signature - X-Sonar-Webhook-HMAC-SHA256 header value
 * @param {string|undefined} secret - The webhook's Secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifySonarQubeSignature(rawBody, signature, secret) {
  // Check shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (!signature || !secret || !/^[0-9a-f]{64}$/i.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Equal-length hex strings as UTF-8 buffers, compared in constant time
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.toLowerCase()));
}

/**
 * SonarQube has no event types: every delivery is an analysis result.
 * Branch on qualityGate.status.
 */
function handleAnalysis(payload) {
  const project = payload.project?.key;
  switch (payload.qualityGate?.status) {
    case 'OK':
      console.log(`Quality gate passed for ${project} (task ${payload.taskId})`);
      // TODO: Promote the build, post a success message
      break;

    case 'ERROR':
      console.log(`Quality gate failed for ${project} (task ${payload.taskId})`);
      // TODO: Block the deploy, notify the owner (see qualityGate.conditions)
      break;

    default:
      console.log(`Analysis ${payload.taskId} for ${project} has status ${payload.status}`);
  }
}

// SonarQube webhook endpoint - raw body for any content type
app.post('/webhooks/sonarqube',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.SONARQUBE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('SONARQUBE_WEBHOOK_SECRET is not configured');
      return res.status(500).send('Secret not configured');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifySonarQubeSignature(rawBody, req.headers['x-sonar-webhook-hmac-sha256'], secret)) {
      console.error('SonarQube webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after verification
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (payload === null || typeof payload !== 'object') {
      return res.status(400).send('Invalid payload');
    }

    // SonarQube never retries and times out after 10 seconds: respond fast
    handleAnalysis(payload);

    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifySonarQubeSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/sonarqube`);
  });
}
