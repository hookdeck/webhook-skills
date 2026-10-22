// Generated with: jfrog-webhooks skill
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
 * Token mode (the default, "use secret for signing" off): JFrog sends the
 * configured secret token as-is in the X-JFrog-Event-Auth header. There is no
 * payload signature, so compare the header to the secret.
 * Signing mode (an HMAC-SHA256 of the payload) is not covered: JFrog does not
 * document which header carries that signature.
 */
function verifyJfrogRequest(headers, secret = process.env.JFROG_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const token = headers['x-jfrog-event-auth'];
  return Boolean(token) && safeEqual(token, secret);
}

/**
 * Every JFrog payload has a `domain` and an `event_type`. Dispatch on both.
 */
function handleEvent(payload) {
  const { domain, event_type: eventType, data = {} } = payload;

  switch (`${domain}.${eventType}`) {
    case 'artifact.deployed':
      console.log(`Artifact deployed: ${data.repo_key}/${data.path}`);
      // TODO: trigger a scan or notify the team
      break;

    case 'artifact.deleted':
      console.log(`Artifact deleted: ${data.repo_key}/${data.path}`);
      // TODO: clean up downstream indexes
      break;

    case 'artifact.moved':
      console.log(`Artifact moved: ${data.source_repo_path} -> ${data.target_repo_path}`);
      // TODO: record the promotion
      break;

    case 'docker.pushed':
      console.log(`Docker tag pushed: ${data.image_name}:${data.tag}`);
      // TODO: roll out the new image
      break;

    case 'build.uploaded':
      console.log(`Build uploaded: ${data.build_name} #${data.build_number}`);
      // TODO: start the release pipeline
      break;

    case 'build.promoted':
      console.log(`Build promoted: ${data.build_name} #${data.build_number}`);
      // TODO: deploy the promoted build
      break;

    default:
      console.log(`Unhandled event: ${domain} ${eventType}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before
// anything is parsed.
app.post('/webhooks/jfrog', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyJfrogRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing X-JFrog-Event-Auth' });
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
    console.error('Error handling JFrog event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyJfrogRequest = verifyJfrogRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/jfrog`);
  });
}
