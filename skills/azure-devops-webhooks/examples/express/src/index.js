// Generated with: azure-devops-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time comparison of two Buffers. Hashing both sides first gives
 * equal-length digests, so timingSafeEqual never throws and length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse "Authorization: Basic base64(username:password)". The scheme is
 * case-insensitive and the credentials are split on the FIRST colon (the
 * password may contain colons). Returns null if missing or malformed.
 */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const match = /^basic +([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64');
  const colon = decoded.indexOf(0x3a);
  if (colon < 0) return null;
  return { username: decoded.subarray(0, colon), password: decoded.subarray(colon + 1) };
}

/**
 * Azure DevOps does not sign Web Hooks payloads. The subscription's basic
 * authentication credentials arrive on every request; they authenticate the
 * sender, not the body, and give no replay protection. Both fields are compared
 * before deciding, so there is no short-circuit.
 */
function verifyAzureDevOpsRequest(
  headers,
  username = process.env.AZURE_DEVOPS_WEBHOOK_USERNAME,
  password = process.env.AZURE_DEVOPS_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, Buffer.from(username, 'utf8'));
  const passOk = safeEqual(creds.password, Buffer.from(password, 'utf8'));
  return userOk && passOk;
}

function handleEvent(payload) {
  const { eventType, message } = payload;
  const text = message && message.text;

  switch (eventType) {
    case 'git.push':
      console.log(`Push: ${text}`);
      // TODO: trigger a build or sync (payload.resource.refUpdates, payload.resource.commits)
      break;

    case 'git.pullrequest.created':
      console.log(`Pull request created: ${text}`);
      // TODO: start a review workflow (payload.resource.pullRequestId)
      break;

    case 'git.pullrequest.updated':
      console.log(`Pull request updated: ${text}`);
      // TODO: refresh the review state
      break;

    case 'git.pullrequest.merged':
      console.log(`Pull request merged: ${text}`);
      // TODO: deploy or close linked tickets
      break;

    case 'workitem.created':
      console.log(`Work item created: ${text}`);
      // TODO: sync payload.resource.fields to your tracker
      break;

    case 'workitem.updated':
      console.log(`Work item updated: ${text}`);
      // TODO: apply payload.resource.fields changes
      break;

    case 'workitem.commented':
      console.log(`Work item commented: ${text}`);
      // TODO: sync the comment
      break;

    case 'build.complete':
      console.log(`Build complete: ${text}`);
      // TODO: report payload.resource.status / payload.resource.result
      break;

    case 'ms.vss-pipelines.run-state-changed-event':
      console.log(`Pipeline run state changed: ${text}`);
      // TODO: report payload.resource.run.state / payload.resource.run.result
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/azure-devops', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyAzureDevOpsRequest(req.headers)) {
    return res
      .status(401)
      .set('WWW-Authenticate', 'Basic realm="azure-devops-webhooks"')
      .json({ error: 'Invalid or missing basic authentication credentials' });
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
    console.error('Error handling Azure DevOps event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyAzureDevOpsRequest = verifyAzureDevOpsRequest;
module.exports.parseBasicAuth = parseBasicAuth;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/azure-devops`);
  });
}
